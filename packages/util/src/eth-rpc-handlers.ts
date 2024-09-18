import { utils } from 'ethers';
import { Between, Equal, FindConditions, In, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';

import { JsonRpcProvider } from '@ethersproject/providers';

import { EventInterface, IndexerInterface } from './types';
import { DEFAULT_ETH_GET_LOGS_RESULT_LIMIT } from './constants';

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
const ERROR_INVALID_BLOCK_HASH = 'Invalid block hash';
const ERROR_INVALID_CONTRACT_ADDRESS = 'Invalid contract address';
const ERROR_INVALID_TOPICS = 'Invalid topics';
const ERROR_BLOCK_NOT_FOUND = 'Block not found';
const ERROR_LIMIT_EXCEEDED = 'Query results exceeds limit';

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
      try {
        if (args.length === 0) {
          throw new ErrorWithCode(CODE_INVALID_PARAMS, ERROR_CONTRACT_INSUFFICIENT_PARAMS);
        }

        const params = args[0];

        // Parse arg params into where options
        const where: FindConditions<EventInterface> = {};

        // Address filter, address or a list of addresses
        if (params.address) {
          buildAddressFilter(params.address, where);
        }

        // Topics filter
        if (params.topics) {
          buildTopicsFilter(params.topics, where);
        }

        // Block hash takes precedence over fromBlock / toBlock if provided
        if (params.blockHash) {
          // Validate input block hash
          if (!utils.isHexString(params.blockHash, 32)) {
            throw new ErrorWithCode(CODE_INVALID_PARAMS, ERROR_INVALID_BLOCK_HASH);
          }

          where.block = {
            blockHash: params.blockHash
          };
        } else if (params.fromBlock || params.toBlock) {
          const fromBlockNumber = params.fromBlock ? await parseEthGetLogsBlockTag(indexer, params.fromBlock) : null;
          const toBlockNumber = params.toBlock ? await parseEthGetLogsBlockTag(indexer, params.toBlock) : null;

          if (fromBlockNumber && toBlockNumber) {
            // Both fromBlock and toBlock set
            where.block = { blockNumber: Between(fromBlockNumber, toBlockNumber) };
          } else if (fromBlockNumber) {
            // Only fromBlock set
            where.block = { blockNumber: MoreThanOrEqual(fromBlockNumber) };
          } else if (toBlockNumber) {
            // Only toBlock set
            where.block = { blockNumber: LessThanOrEqual(toBlockNumber) };
          }
        }

        // Fetch events from the db
        // Load block relation
        const resultLimit = indexer.serverConfig.ethRPC.getLogsResultLimit || DEFAULT_ETH_GET_LOGS_RESULT_LIMIT;
        const events = await indexer.getEvents({
          where,
          relations: ['block'],
          // TODO: Use querybuilder to order by block number
          order: { block: 'ASC', index: 'ASC' },
          take: resultLimit + 1
        });

        // Limit number of results can be returned by a single query
        if (events.length > resultLimit) {
          throw new ErrorWithCode(CODE_SERVER_ERROR, `${ERROR_LIMIT_EXCEEDED}: ${resultLimit}`);
        }

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

const buildAddressFilter = (address: any, where: FindConditions<EventInterface>): void => {
  if (Array.isArray(address)) {
    // Validate input addresses
    address.forEach((add: string) => {
      if (!utils.isHexString(add, 20)) {
        throw new ErrorWithCode(CODE_INVALID_PARAMS, `${ERROR_INVALID_CONTRACT_ADDRESS}: expected hex string of size 20`);
      }
    });

    if (address.length > 0) {
      where.contract = In(address);
    }
  } else {
    // Validate input address
    if (!utils.isHexString(address, 20)) {
      throw new ErrorWithCode(CODE_INVALID_PARAMS, `${ERROR_INVALID_CONTRACT_ADDRESS}: expected hex string of size 20`);
    }

    where.contract = Equal(address);
  }
};

type TopicColumn = 'topic0' | 'topic1' | 'topic2' | 'topic3';

const buildTopicsFilter = (topics: any, where: FindConditions<EventInterface>): void => {
  // Check that topics is an array of size <= 4
  if (!Array.isArray(topics)) {
    throw new ErrorWithCode(CODE_INVALID_PARAMS, ERROR_INVALID_TOPICS);
  }

  if (topics.length > 4) {
    throw new ErrorWithCode(CODE_INVALID_PARAMS, `${ERROR_INVALID_TOPICS}: exceeds max topics`);
  }

  for (let i = 0; i < topics.length; i++) {
    addTopicCondition(topics[i], `topic${i}` as TopicColumn, where);
  }
};

const addTopicCondition = (
  topicFilter: string[] | string,
  topicIndex: TopicColumn,
  where: FindConditions<EventInterface>
): any => {
  if (Array.isArray(topicFilter)) {
    // Validate input topics
    topicFilter.forEach((topic: string) => {
      if (!utils.isHexString(topic, 32)) {
        throw new ErrorWithCode(CODE_INVALID_PARAMS, `${ERROR_INVALID_TOPICS}: expected hex string of size 32 for ${topicIndex}`);
      }
    });

    if (topicFilter.length > 0) {
      where[topicIndex] = In(topicFilter);
    }
  } else {
    // Validate input address
    if (!utils.isHexString(topicFilter, 32)) {
      throw new ErrorWithCode(CODE_INVALID_PARAMS, `${ERROR_INVALID_TOPICS}: expected hex string of size 32 for ${topicIndex}`);
    }

    where[topicIndex] = Equal(topicFilter);
  }
};

const transformEventsToLogs = async (events: Array<EventInterface>): Promise<any[]> => {
  return events.map(event => {
    const parsedExtraInfo = JSON.parse(event.extraInfo);

    const topics: string[] = [];
    [event.topic0, event.topic1, event.topic2, event.topic3].forEach(topic => {
      if (topic) {
        topics.push(topic);
      }
    });

    return {
      address: event.contract.toLowerCase(),
      blockHash: event.block.blockHash,
      blockNumber: `0x${event.block.blockNumber.toString(16)}`,
      transactionHash: event.txHash,
      transactionIndex: `0x${parsedExtraInfo.tx.index.toString(16)}`,
      logIndex: `0x${parsedExtraInfo.logIndex.toString(16)}`,
      data: event.data,
      topics,
      removed: event.block.isPruned
    };
  });
};
