//
// Copyright 2021 Vulcanize, Inc.
//

import path from 'path';

import { BaseProvider } from '@ethersproject/providers';
import { GraphDatabase } from '@cerc-io/util';

import { instantiate } from './loader';
import { getDummyGraphData, getTestDatabase, getTestIndexer, getTestProvider } from '../test/utils';
import { Indexer } from '../test/utils/indexer';

describe('json host api', () => {
  let exports: any;
  let db: GraphDatabase;
  let indexer: Indexer;
  let provider: BaseProvider;

  before(async () => {
    db = getTestDatabase();
    indexer = getTestIndexer();
    provider = getTestProvider();
  });

  it('should load the subgraph example wasm', async () => {
    const dummyGraphData = getDummyGraphData();
    const filePath = path.resolve(__dirname, '../test/subgraph/example1/build/Example1/Example1.wasm');

    const instance = await instantiate(
      db,
      indexer,
      provider,
      { rpcSupportsBlockHashParam: true },
      filePath,
      dummyGraphData
    );

    exports = instance.exports;
    const { _start } = exports;

    // Important to call _start for built subgraphs on instantiation!
    // TODO: Check api version https://github.com/graphprotocol/graph-node/blob/6098daa8955bdfac597cec87080af5449807e874/runtime/wasm/src/module/mod.rs#L533
    _start();
  });

  it('should get JSONValue from bytes', async () => {
    const { testJsonFromBytes } = exports;

    await testJsonFromBytes();
  });

  xit('should parse JSON safely', async () => {
    const { testJsonTryFromBytes } = exports;

    await testJsonTryFromBytes();
  });
});
