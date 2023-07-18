import { LRUCache } from 'lru-cache';
import { FieldNode } from 'graphql';
import { ApolloServerPlugin, GraphQLResponse, GraphQLRequestContext } from 'apollo-server-plugin-base';

import Channel from '@cerc-io/ts-channel';
import type { ReadChannel, ReadWriteChannel } from '@cerc-io/ts-channel';
import type { Client, Voucher } from '@cerc-io/nitro-client';

const IntrospectionQuery = 'IntrospectionQuery';

// TODO: Configure
const LRU_CACHE_MAX_COUNT = 1000;
const LRU_CACHE_TTL = 10 * 1000; // 10s

const FREE_QUERY_LIMIT = 10;

export class Payments {
  // TODO: Persist data
  private remainingFreeQueriesMap: Map<string, number> = new Map();

  private voucherChannels: LRUCache<string, ReadWriteChannel<Voucher>>;
  private stopSubscriptionLoop: ReadWriteChannel<void>;

  // TODO: Read query rate map from config
  // TODO: Add a method to get rate for a query

  // TODO: Track usable balances in a map?

  constructor () {
    this.voucherChannels = new LRUCache<string, ReadWriteChannel<Voucher>>({
      max: LRU_CACHE_MAX_COUNT,
      ttl: LRU_CACHE_TTL
    });
    this.stopSubscriptionLoop = Channel();
  }

  async subscribeVouchers (client: Client): Promise<void> {
    const receivedVouchersChannel = client.receivedVouchers();

    while (true) {
      switch (await Channel.select([
        receivedVouchersChannel.shift(),
        this.stopSubscriptionLoop.shift()
      ])) {
        case receivedVouchersChannel: {
          const voucher = await receivedVouchersChannel.shift();
          if (voucher === undefined) {
            return;
          }

          const associatedPaymentChannel = await client.getPaymentChannel(voucher.channelId);
          const payer = associatedPaymentChannel.balance.payer;

          let voucherChannel = this.voucherChannels.get(payer);
          if (!voucherChannel) {
            // Same buffer size as that of receivedVouchers channel
            voucherChannel = Channel<Voucher>(1000);
            this.voucherChannels.set(payer, voucherChannel);
          }

          // Perform a nonblocking send in case no one is listening
          voucherChannel.push(voucher);
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

  async allowRequest (nitroAddress: string): Promise<void> {
    let remainingFreeQueries = this.remainingFreeQueriesMap.get(nitroAddress);
    if (remainingFreeQueries === undefined) {
      remainingFreeQueries = FREE_QUERY_LIMIT;
    }

    // Check if user has exhausted their free query limit
    if (remainingFreeQueries > 0) {
      this.remainingFreeQueriesMap.set(nitroAddress, remainingFreeQueries - 1);
      return;
    }

    // Wait for a payment voucher to be received from the Nitro account
    await this.getVoucherChannelByNitroAddress(nitroAddress).shift();
  }

  private getVoucherChannelByNitroAddress (nitroAddress: string): ReadChannel<Voucher> {
    let voucherChannel = this.voucherChannels.get(nitroAddress);
    if (!voucherChannel) {
      // Same buffer size as that of receivedVouchers channel
      voucherChannel = Channel<Voucher>(1000);
      this.voucherChannels.set(nitroAddress, voucherChannel);
    }

    return voucherChannel;
  }
}

export const paymentsPlugin = (payments?: Payments): ApolloServerPlugin => {
  return {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async requestDidStart (requestContext: GraphQLRequestContext) {
      return {
        async responseForOperation (requestContext: GraphQLRequestContext): Promise<GraphQLResponse | null> {
          // Continue if payments not setup or it's an introspection query
          if (!payments || requestContext.operationName === IntrospectionQuery) {
            return null;
          }

          // requestContext.request.http.url gives '/?na=naAddress'
          const urlString = `localhost${requestContext.request.http?.url}`;
          const url = new URL(urlString);
          const naAddress = url.searchParams.get('na');

          if (naAddress === null) {
            // return response with an error
            throw new Error('naAddress not provided');
          }

          const querySelections = requestContext.operation?.selectionSet.selections
            .map((selection) => (selection as FieldNode).name.value);

          // console.log('querySelections', querySelections);

          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          for await (const querySelection of querySelections ?? []) {
            // TODO: Charge according to the querySelection

            // console.log('querySelection', querySelection);
            // Wait for approval
            await payments.allowRequest(naAddress);
            // console.log('request allowed');
          }

          return null;
        }
      };
    }
  };
};
