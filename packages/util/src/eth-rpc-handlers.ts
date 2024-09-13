/* eslint-disable @typescript-eslint/no-unused-vars */
import { utils } from 'ethers';
import { Between, Equal, FindConditions, In, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';

import { JsonRpcProvider } from '@ethersproject/providers';

import { EventInterface, IndexerInterface } from './types';

const CODE_INVALID_PARAMS = -32602;
const CODE_INTERNAL_ERROR = -32603;
const CODE_SERVER_ERROR = -32000;

const ERROR_CONTRACT_MAP_NOT_SET = 'Contract map not set';
const ERROR_CONTRACT_ABI_NOT_FOUND = 'Contract ABI not found';
const ERROR_CONTRACT_INSUFFICIENT_PARAMS = 'Insufficient params';
const ERROR_CONTRACT_NOT_RECOGNIZED = 'Contract not recognized';
const ERROR_CONTRACT_METHOD_NOT_FOUND = 'Contract method not found';
const ERROR_METHOD_NOT_IMPLEMENTED = 'Method not implemented';
const ERROR_INVALID_BLOCK_TAG = 'Invalid block tag';
const ERROR_BLOCK_NOT_FOUND = 'Block not found';

const DEFAULT_BLOCK_TAG = 'latest';

class ErrorWithCode extends Error {
  code: number;
  constructor (code: number, message: string) {
    super(message);
    this.code = code;
  }
}

export const createEthRPCHandlers = async (
  indexer: IndexerInterface,
  ethProvider: JsonRpcProvider
): Promise<any> => {
  return {
    eth_blockNumber: async (args: any, callback: any) => {
      const syncStatus = await indexer.getSyncStatus();
      const result = syncStatus ? `0x${syncStatus.latestProcessedBlockNumber.toString(16)}` : '0x';

      callback(null, result);
    },

    eth_call: async (args: any, callback: any) => {
      try {
        if (!indexer.contractMap) {
          throw new ErrorWithCode(CODE_INTERNAL_ERROR, ERROR_CONTRACT_MAP_NOT_SET);
        }

        if (args.length === 0) {
          throw new ErrorWithCode(CODE_INVALID_PARAMS, ERROR_CONTRACT_INSUFFICIENT_PARAMS);
        }

        const { to, data } = args[0];
        const blockTag = args.length > 1 ? args[1] : DEFAULT_BLOCK_TAG;

        const blockHash = await parseEthCallBlockTag(indexer, ethProvider, blockTag);

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
        const encodedResult = contractInterface.encodeFunctionResult(functionFragment, Array.isArray(result.value) ? result.value : [result.value]);

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
      try {
        if (args.length === 0) {
          throw new ErrorWithCode(CODE_INVALID_PARAMS, ERROR_CONTRACT_INSUFFICIENT_PARAMS);
        }

        const params = args[0];

        // Parse arg params in to where options
        const where: FindConditions<EventInterface> = {};

        if (params.address) {
          if (Array.isArray(params.address)) {
            where.contract = In(params.address);
          } else {
            where.contract = Equal(params.address);
          }
        }

        let blockFilter = false;
        if (params.blockHash) {
          // TODO: validate blockHash?
          blockFilter = true;
          where.block = {
            blockHash: params.blockHash
          };
        } else if (params.fromBlock || params.toBlock) {
          blockFilter = true;

          if (!params.fromBlock) {
            const toBlockNumber = await parseEthGetLogsBlockTag(indexer, params.toBlock);
            where.block = {
              blockNumber: LessThanOrEqual(toBlockNumber)
            };
          } else if (!params.toBlock) {
            const fromBlockNumber = await parseEthGetLogsBlockTag(indexer, params.fromBlock);
            where.block = {
              blockNumber: MoreThanOrEqual(fromBlockNumber)
            };
          } else {
            const fromBlockNumber = await parseEthGetLogsBlockTag(indexer, params.fromBlock);
            const toBlockNumber = await parseEthGetLogsBlockTag(indexer, params.toBlock);
            where.block = {
              blockNumber: Between(fromBlockNumber, toBlockNumber)
            };
          }
        }

        // TODO: Construct topics filter

        // Fetch events from the db
        const events = await indexer.getEvents({ where, relations: blockFilter ? ['block'] : undefined });

        // Transform events into result logs
        const result = await transformEventsToLogs(events);

        callback(null, result);
      } catch (error: any) {
        let callBackError;
        if (error instanceof ErrorWithCode) {
          callBackError = { code: error.code, message: error.message };
        } else {
          callBackError = { code: CODE_SERVER_ERROR, message: error.message };
        }

        callback(callBackError);
      }
    }
  };
};

const parseEthCallBlockTag = async (indexer: IndexerInterface, ethProvider: JsonRpcProvider, blockTag: string): Promise<string> => {
  if (utils.isHexString(blockTag)) {
    // Return value if hex string is of block hash length
    if (utils.hexDataLength(blockTag) === 32) {
      return blockTag;
    }

    // Treat hex value as a block number
    const block = await ethProvider.getBlock(blockTag);
    if (block === null) {
      throw new ErrorWithCode(CODE_INVALID_PARAMS, ERROR_BLOCK_NOT_FOUND);
    }

    return block.hash;
  }

  if (blockTag === DEFAULT_BLOCK_TAG) {
    const syncStatus = await indexer.getSyncStatus();
    if (!syncStatus) {
      throw new ErrorWithCode(CODE_INTERNAL_ERROR, 'SyncStatus not found');
    }

    return syncStatus.latestProcessedBlockHash;
  }

  throw new ErrorWithCode(CODE_INVALID_PARAMS, ERROR_INVALID_BLOCK_TAG);
};

const parseEthGetLogsBlockTag = async (indexer: IndexerInterface, blockTag: string): Promise<number> => {
  if (utils.isHexString(blockTag)) {
    return Number(blockTag);
  }

  if (blockTag === DEFAULT_BLOCK_TAG) {
    const syncStatus = await indexer.getSyncStatus();
    if (!syncStatus) {
      throw new ErrorWithCode(CODE_INTERNAL_ERROR, 'SyncStatus not found');
    }

    return syncStatus.latestProcessedBlockNumber;
  }

  throw new ErrorWithCode(CODE_INVALID_PARAMS, ERROR_INVALID_BLOCK_TAG);
};

const transformEventsToLogs = async (events: Array<EventInterface>): Promise<any[]> => {
  // TODO: Implement
  return events;
};
