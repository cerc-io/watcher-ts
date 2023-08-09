import debug from 'debug';
import { LRUCache } from 'lru-cache';
import { FieldNode } from 'graphql';
import { ApolloServerPlugin, GraphQLResponse, GraphQLRequestContext } from 'apollo-server-plugin-base';
import { Response as HTTPResponse } from 'apollo-server-env';
import ApolloBigInt from 'apollo-type-bigint';

import Channel from '@cerc-io/ts-channel';
import type { ReadWriteChannel } from '@cerc-io/ts-channel';
import type { Client, Voucher } from '@cerc-io/nitro-client';
import { utils as nitroUtils, ChannelStatus } from '@cerc-io/nitro-client';
import { IResolvers } from '@graphql-tools/utils';

import { BaseRatesConfig, PaymentsConfig } from './config';
import { gqlQueryCount, gqlTotalQueryCount } from './gql-metrics';

const log = debug('laconic:payments');

const INTROSPECTION_QUERY = 'IntrospectionQuery';
const INTROSPECTION_QUERY_SELECTION = '__schema';
const RATES_QUERY_SELECTION = '_rates_';

const PAYMENT_HEADER_KEY = 'x-payment';
const PAYMENT_HEADER_REGEX = /vhash:(.*),vsig:(.*)/;

const ERR_FREE_QUOTA_EXHUASTED = 'Free quota exhausted';
const ERR_PAYMENT_NOT_RECEIVED = 'Payment not received';
const ERR_AMOUNT_INSUFFICIENT = 'Payment amount insufficient';
const HTTP_CODE_PAYMENT_REQUIRED = 402; // Payment required

const ERR_HEADER_MISSING = 'Payment header x-payment not set';
const ERR_INVALID_PAYMENT_HEADER = 'Invalid payment header format';
const HTTP_CODE_BAD_REQUEST = 400; // Bad request

const EMPTY_VOUCHER_HASH = '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470'; // keccak256('0x')

// Config Defaults
const DEFAULT_REQUEST_TIMEOUT = 10; // 10 seconds

const DEFAULT_FREE_QUERIES_LIMIT = 10;

const DEFAULT_FREE_QUERIES_LIST = ['latestBlock'];

const DEFAULT_LRU_CACHE_MAX_ACCOUNTS = 1000;
const DEFAULT_LRU_CACHE_ACCOUNT_TTL = 30 * 60; // 30mins
const DEFAULT_LRU_CACHE_MAX_VOUCHERS_PER_ACCOUNT = 1000;
const DEFAULT_LRU_CACHE_VOUCHER_TTL = 5 * 60; // 5mins
const DEFAULT_LRU_CACHE_MAX_PAYMENT_CHANNELS = 10000;
const DEFAULT_LRU_CACHE_PAYMENT_CHANNEL_TTL = DEFAULT_LRU_CACHE_ACCOUNT_TTL;

interface Payment {
  voucher: Voucher;
  amount: bigint;
}

enum RateType {
  Query = 'QUERY',
  Mutation = 'MUTATION'
}

interface RateInfo {
  type: RateType;
  name: string;
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

  constructor (config: PaymentsConfig, baseRatesConfig: BaseRatesConfig) {
    this.config = config;
    this.ratesConfig = baseRatesConfig;

    this.receivedPayments = new LRUCache<string, LRUCache<string, Payment>>({
      max: this.config.cache.maxAccounts ?? DEFAULT_LRU_CACHE_MAX_ACCOUNTS,
      ttl: (this.config.cache.accountTTLInSecs ?? DEFAULT_LRU_CACHE_ACCOUNT_TTL) * 1000
    });

    this.paidSoFarOnChannel = new LRUCache<string, bigint>({
      max: this.config.cache.maxPaymentChannels ?? DEFAULT_LRU_CACHE_MAX_PAYMENT_CHANNELS,
      ttl: (this.config.cache.paymentChannelTTLInSecs ?? DEFAULT_LRU_CACHE_PAYMENT_CHANNEL_TTL) * 1000
    });

    this.stopSubscriptionLoop = Channel();
  }

  get freeQueriesList (): string[] {
    return [RATES_QUERY_SELECTION, ...(this.ratesConfig.freeQueriesList ?? DEFAULT_FREE_QUERIES_LIST)];
  }

  get queryRates (): { [key: string]: string } {
    return this.ratesConfig.queries ?? {};
  }

  get mutationRates (): { [key: string]: string } {
    return this.ratesConfig.mutations ?? {};
  }

  getResolvers (): IResolvers {
    return {
      BigInt: new ApolloBigInt('bigInt'),
      Query: {
        _rates_: async (): Promise<RateInfo[]> => {
          log('_rates_');
          gqlTotalQueryCount.inc(1);
          gqlQueryCount.labels('_rates_').inc(1);

          const queryRates = this.queryRates;
          const rateInfos = Object.entries(queryRates).map(([name, amount]) => ({
            type: RateType.Query,
            name,
            amount: BigInt(amount)
          }));

          const mutationRates = this.mutationRates;
          Object.entries(mutationRates).forEach(([name, amount]) => rateInfos.push({
            type: RateType.Mutation,
            name,
            amount: BigInt(amount)
          }));

          return rateInfos;
        }
      }
    };
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
            log(`Amount not set in received voucher on payment channel ${voucher.channelId.string()}`);
            continue;
          }

          const paymentAmount = voucher.amount - (this.paidSoFarOnChannel.get(voucher.channelId.string()) ?? BigInt(0));
          this.paidSoFarOnChannel.set(voucher.channelId.string(), voucher.amount);
          log(`Received a payment voucher of ${paymentAmount} from ${payer}`);

          let paymentsMap = this.receivedPayments.get(payer);
          if (!paymentsMap) {
            paymentsMap = new LRUCache<string, Payment>({
              max: this.config.cache.maxVouchersPerAccount ?? DEFAULT_LRU_CACHE_MAX_VOUCHERS_PER_ACCOUNT,
              ttl: (this.config.cache.voucherTTLInSecs ?? DEFAULT_LRU_CACHE_VOUCHER_TTL) * 1000
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

  async allowRequest (voucherHash: string, signerAddress: string, querySelection: string): Promise<[false, string] | [true, null]> {
    // Use free quota if EMPTY_VOUCHER_HASH passed
    if (voucherHash === EMPTY_VOUCHER_HASH) {
      let remainingFreeQueries = this.remainingFreeQueriesMap.get(signerAddress);
      if (remainingFreeQueries === undefined) {
        remainingFreeQueries = this.ratesConfig.freeQueriesLimit ?? DEFAULT_FREE_QUERIES_LIMIT;
      }

      // Check if user has exhausted their free query limit
      if (remainingFreeQueries > 0) {
        log(`Serving a free query to ${signerAddress}`);
        this.remainingFreeQueriesMap.set(signerAddress, remainingFreeQueries - 1);

        return [true, null];
      }

      log(`Rejecting query from ${signerAddress}: ${ERR_FREE_QUOTA_EXHUASTED}`);
      return [false, ERR_FREE_QUOTA_EXHUASTED];
    }

    // Check if required payment received from the Nitro account
    const configuredQueryCost = this.ratesConfig.queries[querySelection];
    const [paymentReceived, paymentError] = await this.authenticatePayment(voucherHash, signerAddress, BigInt(configuredQueryCost));

    if (paymentReceived) {
      log(`Serving a paid query for ${signerAddress}`);
      return [true, null];
    } else {
      log(`Rejecting query from ${signerAddress}: ${paymentError}`);
      return [false, paymentError];
    }
  }

  async authenticatePayment (voucherHash:string, signerAddress: string, value: bigint): Promise<[false, string] | [true, null]> {
    const [isPaymentReceived, isOfSufficientValue] = this.acceptReceivedPayment(voucherHash, signerAddress, value);
    if (isPaymentReceived) {
      return isOfSufficientValue ? [true, null] : [false, ERR_AMOUNT_INSUFFICIENT];
    }

    // Wait for payment voucher from sender
    const paymentListener = Channel<string>();
    this.paymentListeners.push(paymentListener);
    let requestTimeout;

    const timeoutPromise = new Promise(resolve => {
      requestTimeout = setTimeout(resolve, (this.config.requestTimeoutInSecs ?? DEFAULT_REQUEST_TIMEOUT) * 1000);
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

        if (payer === signerAddress) {
          const [isPaymentReceived, isOfSufficientValue] = this.acceptReceivedPayment(voucherHash, signerAddress, value);
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
  private acceptReceivedPayment (voucherHash:string, signerAddress: string, minRequiredValue: bigint): [boolean, boolean] {
    const paymentsMap = this.receivedPayments.get(signerAddress);

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
          // Continue if payments is not setup
          if (!paymentsManager) {
            return null;
          }

          const querySelections = requestContext.operation?.selectionSet.selections
            .map((selection: any) => (selection as FieldNode).name.value);

          // Continue if it's an introspection query for schema
          // (made by ApolloServer playground / default landing page)
          if (
            requestContext.operationName === INTROSPECTION_QUERY &&
            querySelections && querySelections.length === 1 &&
            querySelections[0] === INTROSPECTION_QUERY_SELECTION
          ) {
            return null;
          }

          const paymentHeader = requestContext.request.http?.headers.get(PAYMENT_HEADER_KEY);
          if (paymentHeader == null) {
            // TODO: Make payment header optional and check only for rate configured queries in loop below
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

          const signerAddress = nitroUtils.getSignerAddress(vhash, vsig);

          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          for await (const querySelection of querySelections ?? []) {
            if (paymentsManager.freeQueriesList.includes(querySelection)) {
              continue;
            }

            // Serve a query for free if rate is not configured
            const configuredQueryCost = paymentsManager.queryRates[querySelection];
            if (configuredQueryCost === undefined) {
              log(`Query rate not configured for "${querySelection}", serving a free query to ${signerAddress}`);
              continue;
            }

            const [allowRequest, rejectionMessage] = await paymentsManager.allowRequest(vhash, signerAddress, querySelection);
            if (!allowRequest) {
              const failResponse: GraphQLResponse = {
                errors: [{ message: rejectionMessage }],
                http: new HTTPResponse(undefined, {
                  headers: requestContext.response?.http?.headers,
                  status: HTTP_CODE_PAYMENT_REQUIRED
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
