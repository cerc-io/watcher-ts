import debug from 'debug';
import { LRUCache } from 'lru-cache';
import { FieldNode } from 'graphql';
import { ApolloServerPlugin, GraphQLResponse, GraphQLRequestContext } from 'apollo-server-plugin-base';
import { Response as HTTPResponse } from 'apollo-server-env';

import Channel from '@cerc-io/ts-channel';
import type { ReadWriteChannel } from '@cerc-io/ts-channel';
import type { Client, Voucher } from '@cerc-io/nitro-client';
import { utils as nitroUtils, ChannelStatus } from '@cerc-io/nitro-client';

import { BaseRatesConfig, PaymentsConfig } from './config';

const log = debug('laconic:payments');

const IntrospectionQuery = 'IntrospectionQuery';
const PAYMENT_HEADER_KEY = 'x-payment';
const PAYMENT_HEADER_REGEX = /vhash:(.*),vsig:(.*)/;

const ERR_FREE_QUOTA_EXHUASTED = 'Free quota exhausted';
const ERR_PAYMENT_NOT_RECEIVED = 'Payment not received';
const ERR_AMOUNT_INSUFFICIENT = 'Payment amount insufficient';
const HTTP_CODE_PAYMENT_NOT_RECEIVED = 402; // Payment required

const ERR_HEADER_MISSING = 'Payment header x-payment not set';
const ERR_INVALID_PAYMENT_HEADER = 'Invalid payment header format';
const HTTP_CODE_BAD_REQUEST = 400; // Bad request

const EMPTY_VOUCHER_HASH = '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470'; // keccak256('0x')

// TODO: Configure
const LRU_CACHE_MAX_ACCOUNT_COUNT = 1000;
const LRU_CACHE_ACCOUNT_TTL = 30 * 60 * 1000; // 30mins
const LRU_CACHE_MAX_VOUCHER_COUNT = 1000;
const LRU_CACHE_VOUCHER_TTL = 5 * 60 * 1000; // 5mins
const LRU_CACHE_MAX_CHANNEL_COUNT = 10000;
const LRU_CACHE_MAX_CHANNEL_TTL = LRU_CACHE_ACCOUNT_TTL;

const DEFAULT_FREE_QUERY_LIMIT = 10;
const FREE_QUERIES = ['latestBlock'];

const REQUEST_TIMEOUT = 10 * 1000; // 10 seconds

interface Payment {
  voucher: Voucher;
  amount: bigint;
}

export class PaymentsManager {
  clientAddress?: string;

  private config: PaymentsConfig;
  private ratesConfig: BaseRatesConfig;

  // TODO: Persist data
  private remainingFreeQueriesMap: Map<string, number> = new Map();

  // TODO: Persist data
  private receivedPayments: LRUCache<string, LRUCache<string, Payment>>;
  private paidSoFarOnChannel: LRUCache<string, bigint>;

  private stopSubscriptionLoop: ReadWriteChannel<void>;
  private paymentListeners: ReadWriteChannel<string>[] = [];

  // TODO: Read query rate map from config
  // TODO: Add a method to get rate for a query

  constructor (config: PaymentsConfig, baseRatesConfig: BaseRatesConfig) {
    this.config = config;
    this.ratesConfig = baseRatesConfig;

    this.receivedPayments = new LRUCache<string, LRUCache<string, Payment>>({
      max: LRU_CACHE_MAX_ACCOUNT_COUNT,
      ttl: LRU_CACHE_ACCOUNT_TTL
    });

    this.paidSoFarOnChannel = new LRUCache<string, bigint>({
      max: LRU_CACHE_MAX_CHANNEL_COUNT,
      ttl: LRU_CACHE_MAX_CHANNEL_TTL
    });

    this.stopSubscriptionLoop = Channel();
  }

  async subscribeToVouchers (client: Client): Promise<void> {
    this.clientAddress = client.address;

    // Load existing open payment channels with amount paid so far from the stored state
    await this.loadPaymentChannels(client);

    const receivedVouchersChannel = client.receivedVouchers();
    log('Starting voucher subscription...');

    while (true) {
      switch (await Channel.select([
        receivedVouchersChannel.shift(),
        this.stopSubscriptionLoop.shift()
      ])) {
        case receivedVouchersChannel: {
          const voucher = receivedVouchersChannel.value();
          if (voucher === undefined) {
            log('Voucher channel closed, stopping voucher subscription');
            return;
          }

          const associatedPaymentChannel = await client.getPaymentChannel(voucher.channelId);
          const payer = associatedPaymentChannel.balance.payer;

          if (!voucher.amount) {
            log(`Amount not set in received voucher on payment channel ${voucher.channelId}`);
            continue;
          }

          const paymentAmount = voucher.amount - (this.paidSoFarOnChannel.get(voucher.channelId.string()) ?? BigInt(0));
          this.paidSoFarOnChannel.set(voucher.channelId.string(), voucher.amount);
          log(`Received a payment voucher of ${paymentAmount} from ${payer}`);

          let paymentsMap = this.receivedPayments.get(payer);
          if (!paymentsMap) {
            paymentsMap = new LRUCache<string, Payment>({
              max: LRU_CACHE_MAX_VOUCHER_COUNT,
              ttl: LRU_CACHE_VOUCHER_TTL
            });

            this.receivedPayments.set(payer, paymentsMap);
          }

          paymentsMap.set(voucher.hash(), { voucher, amount: paymentAmount });

          for await (const [, listener] of this.paymentListeners.entries()) {
            await listener.push(payer);
          }

          break;
        }

        case this.stopSubscriptionLoop:
          log('Stop signal received, stopping voucher subscription');
          return;
      }
    }
  }

  async unSubscribeVouchers (): Promise<void> {
    await this.stopSubscriptionLoop.close();
  }

  async allowRequest (voucherHash: string, voucherSig: string, querySelection: string): Promise<[false, string] | [true, null]> {
    const senderAddress = nitroUtils.getSignerAddress(voucherHash, voucherSig);

    // Use free quota if EMPTY_VOUCHER_HASH passed
    if (voucherHash === EMPTY_VOUCHER_HASH) {
      let remainingFreeQueries = this.remainingFreeQueriesMap.get(senderAddress);
      if (remainingFreeQueries === undefined) {
        remainingFreeQueries = this.ratesConfig.freeGQLQueriesLimit ?? DEFAULT_FREE_QUERY_LIMIT;
      }

      // Check if user has exhausted their free query limit
      if (remainingFreeQueries > 0) {
        log(`Serving a free query to ${senderAddress}`);
        this.remainingFreeQueriesMap.set(senderAddress, remainingFreeQueries - 1);

        return [true, null];
      }

      log(`Rejecting query from ${senderAddress}: ${ERR_FREE_QUOTA_EXHUASTED}`);
      return [false, ERR_FREE_QUOTA_EXHUASTED];
    }

    // Serve a query for free if rate is not configured
    const configuredQueryCost = this.ratesConfig.gqlQueries[querySelection];
    if (configuredQueryCost === undefined) {
      log(`Query rate not configured for "${querySelection}", serving a free query to ${senderAddress}`);
      return [true, null];
    }

    // Check if required payment received from the Nitro account
    const [paymentReceived, paymentError] = await this.authenticatePayment(voucherHash, senderAddress, BigInt(configuredQueryCost));

    if (paymentReceived) {
      log(`Serving a paid query for ${senderAddress}`);
      return [true, null];
    } else {
      log(`Rejecting query from ${senderAddress}: ${paymentError}`);
      return [false, paymentError];
    }
  }

  async authenticatePayment (voucherHash:string, senderAddress: string, value = BigInt(0)): Promise<[false, string] | [true, null]> {
    const [isPaymentReceived, isOfSufficientValue] = this.acceptReceivedPayment(voucherHash, senderAddress, value);
    if (isPaymentReceived) {
      return isOfSufficientValue ? [true, null] : [false, ERR_AMOUNT_INSUFFICIENT];
    }

    // Wait for payment voucher from sender
    const paymentListener = Channel<string>();
    this.paymentListeners.push(paymentListener);
    let requestTimeout;

    const timeoutPromise = new Promise(resolve => {
      requestTimeout = setTimeout(resolve, REQUEST_TIMEOUT);
    });

    try {
      while (true) {
        const payer = await Promise.race([
          paymentListener.shift(),
          timeoutPromise
        ]);

        // payer is undefined if timeout completes or channel is closed externally
        if (!payer) {
          return [false, ERR_PAYMENT_NOT_RECEIVED];
        }

        if (payer === senderAddress) {
          const [isPaymentReceived, isOfSufficientValue] = this.acceptReceivedPayment(voucherHash, senderAddress, value);
          if (isPaymentReceived) {
            return isOfSufficientValue ? [true, null] : [false, ERR_AMOUNT_INSUFFICIENT];
          }
        }
      }
    } finally {
      // Close and remove listener
      await paymentListener.close();
      this.paymentListeners = this.paymentListeners.filter(listener => listener !== paymentListener);

      // Clear timeout
      clearTimeout(requestTimeout);
    }
  }

  // Check for a given payment voucher in LRU cache map
  // Returns whether the voucher was found, whether it was of sufficient value
  private acceptReceivedPayment (voucherHash:string, senderAddress: string, minRequiredValue: bigint): [boolean, boolean] {
    const paymentsMap = this.receivedPayments.get(senderAddress);

    if (!paymentsMap) {
      return [false, false];
    }

    const receivedPayment = paymentsMap.get(voucherHash);

    if (!receivedPayment) {
      return [false, false];
    }

    if (receivedPayment.amount < minRequiredValue) {
      return [true, false];
    }

    paymentsMap.delete(voucherHash);
    return [true, true];
  }

  private async loadPaymentChannels (client: Client): Promise<void> {
    const ledgerChannels = await client.getAllLedgerChannels();

    for await (const ledgerChannel of ledgerChannels) {
      if (ledgerChannel.status === ChannelStatus.Open) {
        const paymentChannels = await client.getPaymentChannelsByLedger(ledgerChannel.iD);

        for (const paymentChannel of paymentChannels) {
          if (paymentChannel.status === ChannelStatus.Open) {
            this.paidSoFarOnChannel.set(paymentChannel.iD.string(), paymentChannel.balance.paidSoFar);
          }
        }
      }
    }
  }
}

export const paymentsPlugin = (paymentsManager?: PaymentsManager): ApolloServerPlugin => {
  return {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async requestDidStart (requestContext: GraphQLRequestContext) {
      return {
        async responseForOperation (requestContext: GraphQLRequestContext): Promise<GraphQLResponse | null> {
          // Continue if payments is not setup or it's an introspection query
          if (!paymentsManager || requestContext.operationName === IntrospectionQuery) {
            return null;
          }

          const paymentHeader = requestContext.request.http?.headers.get(PAYMENT_HEADER_KEY);
          if (paymentHeader == null) {
            return {
              errors: [{ message: ERR_HEADER_MISSING }],
              http: new HTTPResponse(undefined, {
                headers: requestContext.response?.http?.headers,
                status: HTTP_CODE_BAD_REQUEST
              })
            };
          }

          let vhash: string, vsig: string;
          const match = paymentHeader.match(PAYMENT_HEADER_REGEX);

          if (match) {
            [, vhash, vsig] = match;
          } else {
            return {
              errors: [{ message: ERR_INVALID_PAYMENT_HEADER }],
              http: new HTTPResponse(undefined, {
                headers: requestContext.response?.http?.headers,
                status: HTTP_CODE_BAD_REQUEST
              })
            };
          }

          const querySelections = requestContext.operation?.selectionSet.selections
            .map((selection) => (selection as FieldNode).name.value);

          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          for await (const querySelection of querySelections ?? []) {
            // TODO: Charge according to the querySelection
            if (FREE_QUERIES.includes(querySelection)) {
              continue;
            }

            const [allowRequest, rejectionMessage] = await paymentsManager.allowRequest(vhash, vsig, querySelection);
            if (!allowRequest) {
              const failResponse: GraphQLResponse = {
                errors: [{ message: rejectionMessage }],
                http: new HTTPResponse(undefined, {
                  headers: requestContext.response?.http?.headers,
                  status: HTTP_CODE_PAYMENT_NOT_RECEIVED
                })
              };

              return failResponse;
            }
          }

          return null;
        }
      };
    }
  };
};
