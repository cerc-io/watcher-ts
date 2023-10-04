//
// Copyright 2023 Vulcanize, Inc.
//

import debug from 'debug';
import assert from 'assert';
import { LRUCache } from 'lru-cache';
import { FieldNode } from 'graphql';
import { ApolloServerPlugin, GraphQLResponse, GraphQLRequestContext } from 'apollo-server-plugin-base';
import { Response as HTTPResponse } from 'apollo-server-env';

import Channel from '@cerc-io/ts-channel';
import type { ReadWriteChannel } from '@cerc-io/ts-channel';
import type { Voucher } from '@cerc-io/nitro-node';
import { utils as nitroUtils, ChannelStatus, Destination } from '@cerc-io/nitro-node';

import { BaseRatesConfig, NitroPeerConfig, PaymentsConfig } from './config';

const log = debug('laconic:payments');

const IntrospectionQuery = 'IntrospectionQuery';
const IntrospectionQuerySelection = '__schema';

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

export class PaymentsManager {
  nitro: nitroUtils.Nitro;

  private config: PaymentsConfig;
  private ratesConfig: BaseRatesConfig;

  // TODO: Persist data
  private remainingFreeQueriesMap: Map<string, number> = new Map();

  // TODO: Persist data
  private receivedPayments: LRUCache<string, LRUCache<string, Payment>>;
  private paidSoFarOnChannel: LRUCache<string, bigint>;

  private stopSubscriptionLoop: ReadWriteChannel<void>;
  private paymentListeners: ReadWriteChannel<string>[] = [];

  private upstreamNodePaymentChannel?: string;

  constructor (nitro: nitroUtils.Nitro, config: PaymentsConfig, baseRatesConfig: BaseRatesConfig) {
    this.nitro = nitro;
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
    return this.ratesConfig.freeQueriesList ?? DEFAULT_FREE_QUERIES_LIST;
  }

  get queryRates (): { [key: string]: string } {
    return this.ratesConfig.queries ?? {};
  }

  get mutationRates (): { [key: string]: string } {
    return this.ratesConfig.mutations ?? {};
  }

  async subscribeToVouchers (): Promise<void> {
    // Load existing open payment channels with amount paid so far from the stored state
    await this.loadPaymentChannels();

    const receivedVouchersChannel = this.nitro.node.receivedVouchers();
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

          const associatedPaymentChannel = await this.nitro.node.getPaymentChannel(voucher.channelId);
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
    this.stopSubscriptionLoop.close();
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

  async setupUpstreamPaymentChannel (nitro: NitroPeerConfig): Promise<void> {
    log(`Adding upstream Nitro node: ${nitro.address}`);
    await this.nitro.addPeerByMultiaddr(nitro.address, nitro.multiAddr);

    // Create a payment channel with upstream Nitro node
    // if it doesn't already exist
    const existingPaymentChannel = await this.getPaymentChannelWithPeer(nitro.address);
    if (existingPaymentChannel) {
      this.upstreamNodePaymentChannel = existingPaymentChannel;
      log(`Using existing payment channel ${existingPaymentChannel} with upstream Nitro node`);

      return;
    }

    await this.nitro.directFund(
      nitro.address,
      Number(nitro.fundingAmounts.directFund)
    );

    this.upstreamNodePaymentChannel = await this.nitro.virtualFund(
      nitro.address,
      Number(nitro.fundingAmounts.virtualFund)
    );

    // TODO: Handle closures
  }

  async sendUpstreamPayment (amount: string): Promise<{
    channelId: string,
    amount: string,
    signature: string
  }> {
    assert(this.upstreamNodePaymentChannel);

    const dest = new Destination(this.upstreamNodePaymentChannel);
    const voucher = await this.nitro.node.createVoucher(dest, BigInt(amount ?? 0));
    assert(voucher.amount);

    return {
      channelId: voucher.channelId.string(),
      amount: voucher.amount.toString(),
      signature: voucher.signature.toHexString()
    };
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

  private async loadPaymentChannels (): Promise<void> {
    const ledgerChannels = await this.nitro.node.getAllLedgerChannels();

    for await (const ledgerChannel of ledgerChannels) {
      if (ledgerChannel.status === ChannelStatus.Open) {
        const paymentChannels = await this.nitro.node.getPaymentChannelsByLedger(ledgerChannel.iD);

        for (const paymentChannel of paymentChannels) {
          if (paymentChannel.status === ChannelStatus.Open) {
            this.paidSoFarOnChannel.set(paymentChannel.iD.string(), paymentChannel.balance.paidSoFar);
          }
        }
      }
    }
  }

  private async getPaymentChannelWithPeer (nitroPeer: string): Promise<string | undefined> {
    const ledgerChannels = await this.nitro.node.getAllLedgerChannels();
    for await (const ledgerChannel of ledgerChannels) {
      if (
        ledgerChannel.balance.them !== nitroPeer ||
        ledgerChannel.status !== ChannelStatus.Open
      ) {
        continue;
      }

      const paymentChannels = await this.nitro.node.getPaymentChannelsByLedger(ledgerChannel.iD);
      for (const paymentChannel of paymentChannels) {
        if (paymentChannel.status === ChannelStatus.Open) {
          return paymentChannel.iD.string();
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
            requestContext.operationName === IntrospectionQuery &&
            querySelections && querySelections.length === 1 &&
            querySelections[0] === IntrospectionQuerySelection
          ) {
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
