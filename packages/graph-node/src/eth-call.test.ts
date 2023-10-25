//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import path from 'path';

import { BaseProvider } from '@ethersproject/providers';
import { GraphDatabase, EventData } from '@cerc-io/util';

import { instantiate } from './loader';
import exampleAbi from '../test/subgraph/example1/build/Example1/abis/Example1.json';
import { getTestDatabase, getTestIndexer, getTestProvider, getDummyEventData } from '../test/utils';
import { Indexer } from '../test/utils/indexer';

xdescribe('eth-call wasm tests', () => {
  let exports: any;
  let db: GraphDatabase;
  let indexer: Indexer;
  let provider: BaseProvider;

  const contractAddress = process.env.EXAMPLE_CONTRACT_ADDRESS;
  assert(contractAddress);

  const data = {
    abis: {
      Example1: exampleAbi
    },
    dataSource: {
      address: contractAddress,
      network: 'mainnet',
      name: 'Example1'
    }
  };

  let dummyEventData: EventData;

  before(async () => {
    db = getTestDatabase();
    indexer = getTestIndexer();
    provider = getTestProvider();

    // Create dummy test data.
    dummyEventData = await getDummyEventData();
  });

  it('should load the subgraph example wasm', async () => {
    const filePath = path.resolve(__dirname, '../test/subgraph/example1/build/Example1/Example1.wasm');
    const instance = await instantiate(
      db,
      indexer,
      provider,
      {
        rpcSupportsBlockHashParam: true,
        block: dummyEventData.block,
        contractAddress
      },
      filePath,
      data
    );
    exports = instance.exports;
    const { _start } = exports;

    // Important to call _start for built subgraphs on instantiation!
    // TODO: Check api version https://github.com/graphprotocol/graph-node/blob/6098daa8955bdfac597cec87080af5449807e874/runtime/wasm/src/module/mod.rs#L533
    _start();
  });

  it('should execute exported getMethod function', async () => {
    const { testGetEthCall } = exports;

    await testGetEthCall();
  });

  it('should execute exported addMethod function', async () => {
    const { testAddEthCall } = exports;

    await testAddEthCall();
  });

  it('should execute exported structMethod function', async () => {
    const { testStructEthCall } = exports;

    await testStructEthCall();
  });
});
