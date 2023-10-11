//
// Copyright 2023 Vulcanize, Inc.
//

import debug from 'debug';
import assert from 'assert';
import { providers } from 'ethers';
import { LRUCache } from 'lru-cache';
import { FieldNode } from 'graphql';
import { ApolloServerPlugin, GraphQLResponse, GraphQLRequestContext } from 'apollo-server-plugin-base';
import { Response as HTTPResponse } from 'apollo-server-env';

import Channel from '@cerc-io/ts-channel';
import type { ReadWriteChannel } from '@cerc-io/ts-channel';
import type { Voucher } from '@cerc-io/nitro-node';
import { utils as nitroUtils, ChannelStatus } from '@cerc-io/nitro-node';
import { deepCopy } from '@ethersproject/properties';
import { fetchJson } from '@ethersproject/web';

import { BaseRatesConfig, NitroPeerConfig, PaymentsConfig } from './config';

const log = debug('laconic:payments');

const IntrospectionQuery = 'IntrospectionQuery';
const IntrospectionQuerySelection = '__schema';

export const PAYMENT_HEADER_KEY = 'x-payment';
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

  async setupPaymentChannel (nodeConfig: NitroPeerConfig): Promise<string> {
    log(`Adding Nitro node: ${nodeConfig.address}`);
    await this.nitro.addPeerByMultiaddr(nodeConfig.address, nodeConfig.multiAddr);

    // Create a payment channel with the given Nitro node
    // if it doesn't already exist
    const existingPaymentChannel = await this.getPaymentChannelWithPeer(nodeConfig.address);
    if (existingPaymentChannel) {
      log(`Using existing payment channel ${existingPaymentChannel} with Nitro node ${nodeConfig.address}`);
      return existingPaymentChannel;
    }

    await this.nitro.directFund(
      nodeConfig.address,
      Number(nodeConfig.fundingAmounts?.directFund || 0)
    );

    return this.nitro.virtualFund(
      nodeConfig.address,
      Number(nodeConfig.fundingAmounts?.virtualFund || 0)
    );

    // TODO: Handle closures
  }

  async sendPayment (destChannelId: string, amount: string): Promise<{
    vhash:string,
    vsig:string
  }> {
    const voucher = await this.nitro.pay(destChannelId, Number(amount));
    assert(voucher.amount);

    return {
      vhash: voucher.hash(),
      vsig: voucher.signature.toHexString()
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

          try {
            await validateGQLRequest(
              paymentsManager,
              {
                querySelections,
                operationName: requestContext.operationName,
                paymentHeader: requestContext.request.http?.headers.get(PAYMENT_HEADER_KEY)
              }
            );

            return null;
          } catch (error) {
            if (error instanceof GQLPaymentError) {
              return {
                errors: [{ message: error.message }],
                http: new HTTPResponse(undefined, {
                  headers: requestContext.response?.http?.headers,
                  status: error.status
                })
              };
            }

            throw error;
          }
        }
      };
    }
  };
};

class GQLPaymentError extends Error {
  status: number;

  constructor (message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export const validateGQLRequest = async (
  paymentsManager: PaymentsManager,
  { operationName, querySelections, paymentHeader }: {
    operationName?: string | null;
    querySelections?: string[];
    paymentHeader?: string | null;
  }
): Promise<boolean> => {
  // Return true if it's an introspection query for schema
  // (made by ApolloServer playground / default landing page)
  if (
    operationName === IntrospectionQuery &&
    querySelections && querySelections.length === 1 &&
    querySelections[0] === IntrospectionQuerySelection
  ) {
    return true;
  }

  const paidQuerySelections = (querySelections ?? []).filter(querySelection => {
    if (paymentsManager.freeQueriesList.includes(querySelection)) {
      return false;
    }

    // Serve a query for free if rate is not configured
    const configuredQueryCost = paymentsManager.queryRates[querySelection];
    if (configuredQueryCost === undefined) {
      log(`Query rate not configured for "${querySelection}", serving free query`);
      return false;
    }

    return true;
  });

  // Return true if no paid queries exist
  if (!paidQuerySelections.length) {
    return true;
  }

  if (!paymentHeader) {
    throw new GQLPaymentError(ERR_HEADER_MISSING, HTTP_CODE_BAD_REQUEST);
  }

  let vhash: string, vsig: string;
  const match = paymentHeader.match(PAYMENT_HEADER_REGEX);

  if (match) {
    [, vhash, vsig] = match;
  } else {
    throw new GQLPaymentError(ERR_INVALID_PAYMENT_HEADER, HTTP_CODE_BAD_REQUEST);
  }

  const signerAddress = nitroUtils.getSignerAddress(vhash, vsig);

  for await (const querySelection of paidQuerySelections) {
    const [allowRequest, rejectionMessage] = await paymentsManager.allowRequest(vhash, signerAddress, querySelection);
    if (!allowRequest) {
      throw new GQLPaymentError(rejectionMessage, HTTP_CODE_PAYMENT_REQUIRED);
    }
  }

  return true;
};

// Helper method to modify a given JsonRpcProvider to make payment for required methods
// and attach the voucher details in reqeust URL
export const setupProviderWithPayments = (
  provider: providers.JsonRpcProvider,
  paymentsManager: PaymentsManager,
  paymentChannelId: string,
  paidRPCMethods: string[],
  paymentAmount: string
): void => {
  // https://github.com/ethers-io/ethers.js/blob/v5.7.2/packages/providers/src.ts/json-rpc-provider.ts#L502
  provider.send = async (method: string, params: Array<any>): Promise<any> => {
    log(`Making RPC call: ${method}`);

    const request = {
      method: method,
      params: params,
      id: (provider._nextId++),
      jsonrpc: '2.0'
    };

    provider.emit('debug', {
      action: 'request',
      request: deepCopy(request),
      provider: provider
    });

    // We can expand this in the future to any call, but for now these
    // are the biggest wins and do not require any serializing parameters.
    const cache = (['eth_chainId', 'eth_blockNumber'].indexOf(method) >= 0);
    // @ts-expect-error copied code
    if (cache && provider._cache[method]) {
      return provider._cache[method];
    }

    // Send a payment to upstream Nitro node and add details to the request URL
    let headers;

    if (paidRPCMethods.includes(method)) {
      const voucher = await paymentsManager.sendPayment(paymentChannelId, paymentAmount);
      headers = {
        'X-Payment': `vhash:${voucher.vhash},vsig:${voucher.vsig}`
      };
    }

    const result = fetchJson({ ...provider.connection, url: provider.connection.url, headers }, JSON.stringify(request), getResult).then((result) => {
      provider.emit('debug', {
        action: 'response',
        request: request,
        response: result,
        provider: provider
      });

      return result;
    }, (error) => {
      provider.emit('debug', {
        action: 'response',
        error: error,
        request: request,
        provider: provider
      });

      throw error;
    });

    // Cache the fetch, but clear it on the next event loop
    if (cache) {
      provider._cache[method] = result;
      setTimeout(() => {
        // @ts-expect-error copied code
        provider._cache[method] = null;
      }, 0);
    }

    return result;
  };
};

// https://github.com/ethers-io/ethers.js/blob/v5.7.2/packages/providers/src.ts/json-rpc-provider.ts#L139
function getResult (payload: { error?: { code?: number, data?: any, message?: string }, result?: any }): any {
  if (payload.error) {
    // @TODO: not any
    const error: any = new Error(payload.error.message);
    error.code = payload.error.code;
    error.data = payload.error.data;
    throw error;
  }

  return payload.result;
}
