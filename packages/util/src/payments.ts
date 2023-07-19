import { ethers } from 'ethers';
import { LRUCache } from 'lru-cache';
import { FieldNode } from 'graphql';
import { ApolloServerPlugin, GraphQLResponse, GraphQLRequestContext } from 'apollo-server-plugin-base';
import { Response as HTTPResponse } from 'apollo-server-env';

import Channel from '@cerc-io/ts-channel';
import type { ReadWriteChannel } from '@cerc-io/ts-channel';
import type { Client, Signature, Voucher } from '@cerc-io/nitro-client';
import { recoverEthereumMessageSigner, getSignatureFromEthersSignature } from '@cerc-io/nitro-client';
import { hex2Bytes } from '@cerc-io/nitro-util';

const IntrospectionQuery = 'IntrospectionQuery';
const HASH_HEADER_KEY = 'hash';
const SIG_HEADER_KEY = 'sig';

const ERR_PAYMENT_NOT_RECEIVED = 'Payment not received';
const HTTP_CODE_PAYMENT_NOT_RECEIVED = 402; // Payment required

const ERR_HEADER_MISSING = 'Header for hash or sig not set';
const HTTP_CODE_HEADER_MISSING = 400; // Bad request

const EMPTY_VOUCHER_HASH = '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470'; // keccak256('0x')

// TODO: Configure
const LRU_CACHE_MAX_ACCOUNT_COUNT = 1000;
const LRU_CACHE_ACCOUNT_TTL = 30 * 60 * 1000; // 30mins
const LRU_CACHE_MAX_VOUCHER_COUNT = 1000;
const LRU_CACHE_VOUCHER_TTL = 5 * 60 * 1000; // 5mins

const FREE_QUERY_LIMIT = 10;

export class PaymentsManager {
  // TODO: Persist data
  private remainingFreeQueriesMap: Map<string, number> = new Map();

  private receivedVouchers: LRUCache<string, LRUCache<string, Voucher>>;
  private stopSubscriptionLoop: ReadWriteChannel<void>;

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
    const receivedVouchersChannel = client.receivedVouchers();

    while (true) {
      switch (await Channel.select([
        receivedVouchersChannel.shift(),
        this.stopSubscriptionLoop.shift()
      ])) {
        case receivedVouchersChannel: {
          const voucher = receivedVouchersChannel.value();
          if (voucher === undefined) {
            return;
          }

          const associatedPaymentChannel = await client.getPaymentChannel(voucher.channelId);
          const payer = associatedPaymentChannel.balance.payer;

          let vouchersMap = this.receivedVouchers.get(payer);
          if (!vouchersMap) {
            vouchersMap = new LRUCache<string, Voucher>({
              max: LRU_CACHE_MAX_VOUCHER_COUNT,
              ttl: LRU_CACHE_VOUCHER_TTL
            });

            this.receivedVouchers.set(payer, vouchersMap);
          }

          vouchersMap.set(voucher.hash(), voucher);
          break;
        }

        case this.stopSubscriptionLoop:
          return;
      }
    }
  }

  async unSubscribeVouchers (): Promise<void> {
    await this.stopSubscriptionLoop.close();
  }

  async allowRequest (voucherHash: string, voucherSig: string): Promise<boolean> {
    const senderAddress = getSenderAddress(voucherHash, voucherSig);

    if (voucherHash === EMPTY_VOUCHER_HASH) {
      let remainingFreeQueries = this.remainingFreeQueriesMap.get(senderAddress);
      if (remainingFreeQueries === undefined) {
        remainingFreeQueries = FREE_QUERY_LIMIT;
      }

      // Check if user has exhausted their free query limit
      if (remainingFreeQueries > 0) {
        this.remainingFreeQueriesMap.set(senderAddress, remainingFreeQueries - 1);
        return true;
      }
    }

    // Wait for a payment voucher to be received from the Nitro account
    return this.authenticateVoucherForSender(voucherHash, senderAddress);
  }

  private async authenticateVoucherForSender (voucherHash:string, senderAddress: string): Promise<boolean> {
    const vouchersMap = this.receivedVouchers.get(senderAddress);
    if (!vouchersMap) {
      return false;
    }

    const receivedVoucher = vouchersMap.get(voucherHash);
    if (receivedVoucher) {
      vouchersMap.delete(voucherHash);
      return true;
    }

    return false;
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

          const hash = requestContext.request.http?.headers.get(HASH_HEADER_KEY);
          const sig = requestContext.request.http?.headers.get(SIG_HEADER_KEY);

          if (hash == null || sig == null) {
            return {
              errors: [{ message: ERR_HEADER_MISSING }],
              http: new HTTPResponse(undefined, {
                headers: requestContext.response?.http?.headers,
                status: HTTP_CODE_HEADER_MISSING
              })
            };
          }

          const querySelections = requestContext.operation?.selectionSet.selections
            .map((selection) => (selection as FieldNode).name.value);

          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          for await (const querySelection of querySelections ?? []) {
            // TODO: Charge according to the querySelection

            const failResponse: GraphQLResponse = {
              errors: [{ message: ERR_PAYMENT_NOT_RECEIVED }],
              http: new HTTPResponse(undefined, {
                headers: requestContext.response?.http?.headers,
                status: HTTP_CODE_PAYMENT_NOT_RECEIVED
              })
            };

            const allowRequest = await paymentsManager.allowRequest(hash, sig);
            if (!allowRequest) {
              return failResponse;
            }
          }

          return null;
        }
      };
    }
  };
};

const getSenderAddress = (hash: string, sig: string): string => {
  const splitSig = ethers.utils.splitSignature(sig);
  const signature: Signature = getSignatureFromEthersSignature(splitSig);

  return recoverEthereumMessageSigner(hex2Bytes(hash), signature);
};
