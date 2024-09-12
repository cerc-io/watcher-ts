/* eslint-disable @typescript-eslint/no-unused-vars */
import { IndexerInterface } from './types';

const CODE_INVALID_PARAMS = -32602;
const CODE_INTERNAL_ERROR = -32603;
const CODE_SERVER_ERROR = -32000;

const ERROR_CONTRACT_MAP_NOT_SET = 'Contract map not set';
const ERROR_CONTRACT_ABI_NOT_FOUND = 'Contract ABI not found';
const ERROR_CONTRACT_INSUFFICIENT_PARAMS = 'Insufficient params';
const ERROR_CONTRACT_NOT_RECOGNIZED = 'Contract not recognized';
const ERROR_CONTRACT_METHOD_NOT_FOUND = 'Contract method not found';
const ERROR_METHOD_NOT_IMPLEMENTED = 'Method not implemented';

class ErrorWithCode extends Error {
  code: number;
  constructor (code: number, message: string) {
    super(message);
    this.code = code;
  }
}

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
      // TODO: Parse blockTag

      try {
        if (args.length === 0) {
          throw new ErrorWithCode(CODE_INVALID_PARAMS, ERROR_CONTRACT_INSUFFICIENT_PARAMS);
        }

        const { to, data, blockTag } = args[0];

        if (!indexer.contractMap) {
          throw new ErrorWithCode(CODE_INTERNAL_ERROR, ERROR_CONTRACT_MAP_NOT_SET);
        }

        // For values other than blockHash, resolve value from block_progress table
        const latestBlock = await indexer.getLatestCanonicalBlock();
        const blockHash = latestBlock?.blockHash;

        const watchedContract = indexer.getWatchedContracts().find(contract => contract.address === to);
        if (!watchedContract) {
          throw new ErrorWithCode(CODE_INVALID_PARAMS, ERROR_CONTRACT_NOT_RECOGNIZED);
        }

        const contractInterface = indexer.contractMap.get(watchedContract.kind);
        if (!contractInterface) {
          throw new ErrorWithCode(CODE_INTERNAL_ERROR, ERROR_CONTRACT_ABI_NOT_FOUND);
        }

        // Slice out method signature from data
        const functionSelector = data.slice(0, 10);

        // Find the matching function from the ABI
        const functionFragment = contractInterface.getFunction(functionSelector);
        if (!functionFragment) {
          throw new ErrorWithCode(CODE_INVALID_PARAMS, ERROR_CONTRACT_METHOD_NOT_FOUND);
        }

        // Decode the data based on the matched function
        const decodedData = contractInterface.decodeFunctionData(functionFragment, data);

        const functionName = functionFragment.name;
        const indexerMethod = (indexer as any)[functionName].bind(indexer);
        if (!indexerMethod) {
          throw new ErrorWithCode(CODE_SERVER_ERROR, ERROR_METHOD_NOT_IMPLEMENTED);
        }

        const result = await indexerMethod(blockHash, to, ...decodedData);
        const encodedResult = contractInterface.encodeFunctionResult(functionFragment, [result.value]);

        callback(null, encodedResult);
      } catch (error: any) {
        let callBackError;
        if (error instanceof ErrorWithCode) {
          callBackError = { code: error.code, message: error.message };
        } else {
          callBackError = { code: CODE_SERVER_ERROR, message: error.message };
        }

        callback(callBackError);
      }
    },

    eth_getLogs: async (args: any, callback: any) => {
      // TODO: Implement
    }
  };
};
