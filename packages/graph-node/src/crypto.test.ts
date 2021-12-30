//
// Copyright 2021 Vulcanize, Inc.
//

import path from 'path';
import { expect } from 'chai';
import { utils } from 'ethers';

import { BaseProvider } from '@ethersproject/providers';

import { instantiate } from './loader';
import { getTestDatabase, getTestIndexer, getTestProvider } from '../test/utils';
import { Database } from './database';
import { Indexer } from '../test/utils/indexer';

describe('crypto host api', () => {
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

  it('should return keccak256 hash', async () => {
    const { testCrypto, __getString, __newString } = exports;

    const hexString = '0x1234';
    const hexStringPtr = await __newString(hexString);
    const keccak256Ptr = await testCrypto(hexStringPtr);
    const keccak256 = __getString(keccak256Ptr);

    expect(keccak256)
      .to
      .equal(utils.keccak256(hexString));
  });
});
