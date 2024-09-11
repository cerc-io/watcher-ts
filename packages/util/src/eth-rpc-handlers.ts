/* eslint-disable @typescript-eslint/no-unused-vars */
import { IndexerInterface } from './types';

export const createEthRPCHandlers = async (
  indexer: IndexerInterface
): Promise<any> => {
  return {
    eth_blockNumber: async (args: any, callback: any) => {
      const syncStatus = await indexer.getSyncStatus();
      const result = syncStatus ? `0x${syncStatus.latestProcessedBlockNumber.toString(16)}` : '0x';

      callback(null, result);
    },

    eth_call: async (args: any, callback: any) => {
      // TODO: Implement
    },

    eth_getLogs: async (args: any, callback: any) => {
      // TODO: Implement
    }
  };
};
