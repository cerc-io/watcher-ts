//
// Copyright 2021 Vulcanize, Inc.
//

import path from 'path';
import { expect } from 'chai';

import { BaseProvider } from '@ethersproject/providers';

import { instantiate } from './loader';
import { getTestDatabase, getTestIndexer, getTestProvider } from '../test/utils';
import { Database } from './database';
import { Indexer } from '../test/utils/indexer';

describe('eth-call wasm tests', () => {
  let exports: any;
  let db: Database;
  let indexer: Indexer;
  let provider: BaseProvider;

  before(async () => {
    db = getTestDatabase();
    indexer = getTestIndexer();
    provider = getTestProvider();
  });

  it('should load the subgraph example wasm', async () => {
    const filePath = path.resolve(__dirname, '../test/subgraph/example1/build/Example1/Example1.wasm');
    const instance = await instantiate(
      db,
      indexer,
      provider,
      {},
      filePath
    );
    exports = instance.exports;
    const { _start } = exports;

    // Important to call _start for built subgraphs on instantiation!
    // TODO: Check api version https://github.com/graphprotocol/graph-node/blob/6098daa8955bdfac597cec87080af5449807e874/runtime/wasm/src/module/mod.rs#L533
    _start();
  });

  it('should encode data', async () => {
    const { testEthereumEncode, __getString } = exports;

    const encoded = await testEthereumEncode();
    const encodedString = __getString(encoded);
    expect(encodedString).to.equal('0x0000000000000000000000000000000000000000000000000000000000000420000000000000000000000000000000000000000000000000000000000000003e');
  });
});
