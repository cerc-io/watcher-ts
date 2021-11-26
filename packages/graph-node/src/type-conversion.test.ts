//
// Copyright 2021 Vulcanize, Inc.
//

import path from 'path';
import { expect } from 'chai';
import { utils } from 'ethers';
import BN from 'bn.js';

import { BN_ENDIANNESS, instantiate } from './loader';
import { getTestDatabase, getTestIndexer } from '../test/utils';
import { Database } from './database';
import { Indexer } from '../test/utils/indexer';

const EXAMPLE_WASM_FILE_PATH = '../test/subgraph/example1/build/Example1/Example1.wasm';

describe('typeConversion wasm tests', () => {
  let exports: any;
  let db: Database;
  let indexer: Indexer;

  before(async () => {
    db = getTestDatabase();
    indexer = getTestIndexer();

    const filePath = path.resolve(__dirname, EXAMPLE_WASM_FILE_PATH);
    const instance = await instantiate(
      db,
      indexer,
      { event: { } },
      filePath
    );
    exports = instance.exports;
    const { _start } = exports;

    // Important to call _start for built subgraphs on instantiation!
    // TODO: Check api version https://github.com/graphprotocol/graph-node/blob/6098daa8955bdfac597cec87080af5449807e874/runtime/wasm/src/module/mod.rs#L533
    _start();
  });

  xit('should execute typeConversion bytesToHex API', async () => {
    const { testBytesToHex, __getString } = exports;

    const ptr = await testBytesToHex();
    expect(__getString(ptr)).to.equal('0x231a');
  });

  xit('should execute typeConversion bigIntToString API', async () => {
    const { testBigIntToString, __getString } = exports;

    const ptr = await testBigIntToString();
    expect(__getString(ptr)).to.equal('1000000000000000000');
  });

  xit('should execute typeConversion stringToH160 API', async () => {
    const { testStringToH160, __getString } = exports;

    const ptr = await testStringToH160();
    expect(__getString(ptr)).to.equal('0xafad925b5eae1e370196cba39893e858ff7257d5');
  });

  it('should execute typeConversion bigIntToHex API', async () => {
    const { testBigIntToHex, __getString, __getArray, __newString } = exports;

    // Using smaller to also test with BigInt.fromI32
    const bigNumber = new BN('2342353', BN_ENDIANNESS);
    console.log('bn', bigNumber.toString());
    const value = await __newString(bigNumber.toString());

    const ptr = await testBigIntToHex(value);
    const ptrs = __getArray(ptr);
    expect(__getString(ptrs[0])).to.equal(__getString(ptrs[1]));
    expect(__getString(ptrs[0])).to.equal(bigNumber.toString('hex'));
  });

  return;

  it('should execute typeConversion bytesToString API', async () => {
    const { testBytesToString, __getString, __newString } = exports;

    const testString = 'test string';
    const value = await __newString(testString);

    const ptr = await testBytesToString(value);
    expect(__getString(ptr)).to.equal(testString);
  });

  it('should execute typeConversion bytesToBase58 API', async () => {
    const { testBytesToBase58, __getString, __newString } = exports;

    const testString = 'test base58';
    const value = await __newString(testString);

    const ptr = await testBytesToBase58(value);

    const base58String = utils.base58.encode(utils.toUtf8Bytes(testString));
    expect(__getString(ptr)).to.equal(base58String);
  });
});
