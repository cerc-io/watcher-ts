import debug from 'debug';
import { LRUCache } from 'lru-cache';
import { FieldNode } from 'graphql';
import { ApolloServerPlugin, GraphQLResponse, GraphQLRequestContext } from 'apollo-server-plugin-base';
import { Response as HTTPResponse } from 'apollo-server-env';

import Channel from '@cerc-io/ts-channel';
import type { ReadWriteChannel } from '@cerc-io/ts-channel';
import type { Client, Voucher } from '@cerc-io/nitro-client';
import { utils as nitroUtils } from '@cerc-io/nitro-client';

const log = debug('laconic:payments');

const IntrospectionQuery = 'IntrospectionQuery';
const PAYMENT_HEADER_KEY = 'x-payment';
const PAYMENT_HEADER_REGEX = /vhash:(.*),vsig:(.*)/;

const ERR_FREE_QUOTA_EXHUASTED = 'Free quota exhausted';
const ERR_PAYMENT_NOT_RECEIVED = 'Payment not received';
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

const FREE_QUERY_LIMIT = 10;
const FREE_QUERIES = ['latestBlock'];

const REQUEST_TIMEOUT = 10 * 1000; // 10 seconds

export class PaymentsManager {
  clientAddress?: string;

  // TODO: Persist data
  private remainingFreeQueriesMap: Map<string, number> = new Map();

  private receivedVouchers: LRUCache<string, LRUCache<string, Voucher>>;
  private stopSubscriptionLoop: ReadWriteChannel<void>;
  private paymentListeners: ReadWriteChannel<string>[] = [];

  // TODO: Read query rate map from config
  // TODO: Add a method to get rate for a query

  constructor () {
    this.receivedVouchers = new LRUCache<string, LRUCache<string, Voucher>>({
      max: LRU_CACHE_MAX_ACCOUNT_COUNT,
      ttl: LRU_CACHE_ACCOUNT_TTL
    });
    this.stopSubscriptionLoop = Channel();
  }

  async subscribeToVouchers (client: Client): Promise<void> {
    this.clientAddress = client.address;

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
          log(`Received a payment voucher from ${payer}`);

          let vouchersMap = this.receivedVouchers.get(payer);
          if (!vouchersMap) {
            vouchersMap = new LRUCache<string, Voucher>({
              max: LRU_CACHE_MAX_VOUCHER_COUNT,
              ttl: LRU_CACHE_VOUCHER_TTL
            });

            this.receivedVouchers.set(payer, vouchersMap);
          }

          vouchersMap.set(voucher.hash(), voucher);

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

  async allowRequest (voucherHash: string, voucherSig: string): Promise<[boolean, string]> {
    const senderAddress = nitroUtils.getSignerAddress(voucherHash, voucherSig);

    if (voucherHash === EMPTY_VOUCHER_HASH) {
      let remainingFreeQueries = this.remainingFreeQueriesMap.get(senderAddress);
      if (remainingFreeQueries === undefined) {
        remainingFreeQueries = FREE_QUERY_LIMIT;
      }

      // Check if user has exhausted their free query limit
      if (remainingFreeQueries > 0) {
        log(`Serving a free query for ${senderAddress}`);
        this.remainingFreeQueriesMap.set(senderAddress, remainingFreeQueries - 1);

        return [true, ''];
      }

      log(`Rejecting query from ${senderAddress}, user has exhausted their free quota`);
      return [false, ERR_FREE_QUOTA_EXHUASTED];
    }

    // Check for payment voucher received from the Nitro account
    const paymentVoucherRecived = await this.authenticateVoucherForSender(voucherHash, senderAddress);

    if (paymentVoucherRecived) {
      log(`Serving a paid query for ${senderAddress}`);
      return [true, ''];
    } else {
      log(`Rejecting query from ${senderAddress}, payment voucher not received`);
      return [false, ERR_PAYMENT_NOT_RECEIVED];
    }
  }

  async authenticateVoucherForSender (voucherHash:string, senderAddress: string): Promise<boolean> {
    if (this.acceptReceivedVouchers(voucherHash, senderAddress)) {
      return true;
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
          return false;
        }

        if (payer === senderAddress) {
          if (this.acceptReceivedVouchers(voucherHash, senderAddress)) {
            return true;
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

  // Check vouchers in LRU cache map and remove them
  // Returns false if not found
  // Returns true after being found and removed
  private acceptReceivedVouchers (voucherHash:string, senderAddress: string): boolean {
    const vouchersMap = this.receivedVouchers.get(senderAddress);

    if (!vouchersMap) {
      return false;
    }

    const receivedVoucher = vouchersMap.get(voucherHash);

    if (!receivedVoucher) {
      return false;
    }

    vouchersMap.delete(voucherHash);
    return true;
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

            const [allowRequest, rejectionMessage] = await paymentsManager.allowRequest(vhash, vsig);
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
