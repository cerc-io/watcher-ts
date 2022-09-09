//
// Copyright 2021 Vulcanize, Inc.
//

import { BaseProvider } from '@ethersproject/providers';
import { getCustomProvider } from '@cerc-io/util';
import { EthClient } from '@cerc-io/ipld-eth-client';
import { StorageLayout } from '@cerc-io/solidity-mapper';

import { EventData } from '../../src/utils';
import { Database } from '../../src/database';
import { Indexer } from './indexer';

const NETWORK_URL = 'http://127.0.0.1:8081';
const IPLD_ETH_SERVER_GQL_URL = 'http://127.0.0.1:8082/graphql';

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
export const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000';

export const getDummyEventData = async (): Promise<EventData> => {
  // Get the latest mined block from the chain.
  const provider = getCustomProvider(NETWORK_URL);
  const blockNumber = await provider.getBlockNumber();
  const ethersBlock = await provider.getBlock(blockNumber);

  const block = {
    headerId: 0,
    blockHash: ethersBlock.hash,
    blockNumber: ethersBlock.number.toString(),
    timestamp: '0',
    parentHash: ZERO_HASH,
    stateRoot: ZERO_HASH,
    td: ZERO_HASH,
    txRoot: ZERO_HASH,
    receiptRoot: ZERO_HASH,
    uncleHash: ZERO_HASH,
    difficulty: '0',
    gasLimit: '0',
    gasUsed: '0',
    author: ZERO_ADDRESS,
    size: '0'
  };

  const tx = {
    hash: ZERO_HASH,
    index: 0,
    from: ZERO_ADDRESS,
    to: ZERO_ADDRESS,
    value: '0',
    gasLimit: '0',
    gasPrice: '0',
    input: ZERO_HASH
  };

  return {
    block,
    tx,
    inputs: [],
    event: {},
    eventIndex: 0
  };
};

export const getDummyGraphData = (): any => {
  return {
    dataSource: {
      address: ZERO_ADDRESS,
      network: 'mainnet'
    }
  };
};

export const getTestDatabase = (): Database => {
  return new Database({ type: 'postgres' }, '');
};

export const getTestIndexer = (storageLayout?: Map<string, StorageLayout>): Indexer => {
  const ethClient = new EthClient({
    gqlEndpoint: IPLD_ETH_SERVER_GQL_URL,
    cache: undefined
  });

  return new Indexer(ethClient, storageLayout);
};

export const getTestProvider = (): BaseProvider => {
  const provider = getCustomProvider(NETWORK_URL);

  return provider;
};
