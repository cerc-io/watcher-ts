//
// Copyright 2021 Vulcanize, Inc.
//

import path from 'path';
import { expect } from 'chai';

import { instantiate } from './loader';
import { getTestDatabase, getTestIndexer } from '../test/utils';
import { Database } from './database';
import { Indexer } from '../test/utils/indexer';

const WASM_FILE_PATH = '../build/debug.wasm';

describe('wasm loader tests', () => {
  let exports: any;
  let db: Database;
  let indexer: Indexer;

  before(async () => {
    db = getTestDatabase();
    indexer = getTestIndexer();

    const filePath = path.resolve(__dirname, WASM_FILE_PATH);
    const instance = await instantiate(
      db,
      indexer,
      { event: {} },
      filePath
    );

    exports = instance.exports;
  });

  it('should execute exported function', async () => {
    const { callGraphAPI } = exports;
    callGraphAPI();
  });

  it('should execute async function', async () => {
    const { callAsyncMethod } = exports;
    await callAsyncMethod();
  });

  it('should use a class/instance created in wasm from JS', async () => {
    const { Foo, __getString, __pin, __unpin } = exports;

    const fooPtr = await __pin(await Foo.getFoo());
    const foo = Foo.wrap(fooPtr);
    const strPtr = await foo.getString();
    expect(__getString(strPtr)).to.equal('hello world!');
    await __unpin(fooPtr);
  });

  it('should instantiate a class in wasm from JS', async () => {
    const { Foo, FooID, Bar, __getString, __new, __pin, __unpin, __newString } = exports;

    const fooPtr = await __pin(await __new(FooID));
    const foo = Foo.wrap(fooPtr);
    const strPtr = await foo.getString();
    expect(__getString(strPtr)).to.equal('hello world!');
    __unpin(fooPtr);

    const bar = await Bar.__new(await __newString('test'));
    expect(__getString(await bar.prop)).to.equal('test');
  });
});
