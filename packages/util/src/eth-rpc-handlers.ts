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
      // TODO: Handle empty args
      // TODO: Set errors in response
      // TODO: Parse blockTag

      const { to, data, blockTag } = args[0];

      // For values other than blockHash, resolve value from block_progress table
      const latestBlock = await indexer.getLatestCanonicalBlock();
      const blockHash = latestBlock?.blockHash;

      const watchedContract = indexer.getWatchedContracts().find(contract => contract.address === to);
      if (!watchedContract) {
        throw new Error('Contract not recognized');
      }

      if (!indexer.contractMap) {
        throw new Error('Contract map not found');
      }

      const contractInterface = indexer.contractMap.get(watchedContract.kind);
      if (!contractInterface) {
        throw new Error('Contract ABI not found');
      }

      // Slice out method signature
      const functionSelector = data.slice(0, 10);

      // Find the matching function from the ABI
      const functionFragment = contractInterface.getFunction(functionSelector);
      if (!functionFragment) {
        throw new Error('Method not found');
      }

      // Decode the data based on the matched function
      const decodedData = contractInterface.decodeFunctionData(functionFragment, data);

      const functionName = functionFragment.name;
      const indexerMethod = (indexer as any)[functionName].bind(indexer);
      if (indexerMethod && typeof indexerMethod === 'function') {
        const result = await indexerMethod(blockHash, to, ...decodedData);
        const encodedResult = contractInterface.encodeFunctionResult(functionFragment, [result.value]);
        callback(null, encodedResult);
      }
    },

    eth_getLogs: async (args: any, callback: any) => {
      // TODO: Implement
    }
  };
};
