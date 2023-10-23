//
// Copyright 2021 Vulcanize, Inc.
//

import path from 'path';
import { expect } from 'chai';

import { BaseProvider } from '@ethersproject/providers';
import { GraphDatabase } from '@cerc-io/util';

import { instantiate } from './loader';
import { getDummyGraphData, getTestDatabase, getTestIndexer, getTestProvider } from '../test/utils';
import { Indexer } from '../test/utils/indexer';

describe('ethereum ABI encode decode', () => {
  let exports: any;
  let db: GraphDatabase;
  let indexer: Indexer;
  let provider: BaseProvider;
  let encoded: string;

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

  it('should encode data', async () => {
    const { testEthereumEncode, __getString } = exports;

    const encodedPtr = await testEthereumEncode();
    encoded = __getString(encodedPtr);

    expect(encoded)
      .to
      .equal('0x0000000000000000000000000000000000000000000000000000000000000420583bc7e1bc4799a225663353b82eb36d925399e6ef2799a6a95909f5ab8ac945000000000000000000000000000000000000000000000000000000000000003e000000000000000000000000000000000000000000000000000000000000003f0000000000000000000000000000000000000000000000000000000000000001');
  });

  it('should decode data', async () => {
    const { testEthereumDecode, __getString, __getArray, __newString } = exports;

    const encodedString = await __newString(encoded);
    const decodedArrayPtr = await testEthereumDecode(encodedString);
    const decodedArray = __getArray(decodedArrayPtr);
    const [addressString, bytesString, bigInt1String, bigInt2String, boolString] = decodedArray.map((value: any) => __getString(value));

    expect(addressString).to.equal('0x0000000000000000000000000000000000000420');
    expect(bytesString).to.equal('0x583bc7e1bc4799a225663353b82eb36d925399e6ef2799a6a95909f5ab8ac945');
    expect(bigInt1String).to.equal('62');
    expect(bigInt2String).to.equal('63');
    expect(boolString).to.equal('true');
  });
});
