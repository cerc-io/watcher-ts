//
// Copyright 2021 Vulcanize, Inc.
//

import path from 'path';
import { expect } from 'chai';
import { utils } from 'ethers';

import { BaseProvider } from '@ethersproject/providers';
import { GraphDatabase } from '@cerc-io/util';

import { instantiate } from './loader';
import { getDummyGraphData, getTestDatabase, getTestIndexer, getTestProvider } from '../test/utils';
import { Indexer } from '../test/utils/indexer';

const WASM_FILE_PATH = '../build/debug.wasm';

describe('wasm loader tests', () => {
  let exports: any;
  let db: GraphDatabase;
  let indexer: Indexer;
  let provider: BaseProvider;
  let module: WebAssembly.Module;
  let dummyGraphData: any;

  before(async () => {
    db = getTestDatabase();
    indexer = getTestIndexer();
    provider = getTestProvider();
    dummyGraphData = getDummyGraphData();

    const filePath = path.resolve(__dirname, WASM_FILE_PATH);

    const instance = await instantiate(
      db,
      indexer,
      provider,
      {},
      filePath,
      dummyGraphData
    );

    exports = instance.exports;
    module = instance.module;
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

  it('should log messages', async () => {
    const { testLog } = exports;

    // Should print all log messages for different levels.
    await testLog();
  });

  it('should throw out of memory error', async () => {
    // Maximum memory is set to 10 pages (640KB) when compiling using asc maximumMemory option.
    // https://www.assemblyscript.org/compiler.html#command-line-options

    const { testMemory, __newString, memory } = exports;

    try {
      // Continue loop until memory size reaches max size 640KB
      // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WebAssembly/Memory/buffer
      while (memory.buffer.byteLength <= 1024 * 640) {
        // Create long string of 100KB.
        const longString = utils.hexValue(utils.randomBytes(1024 * 100 / 2));

        const stringPtr = await __newString(longString);
        await testMemory(stringPtr);
      }

      expect.fail('wasm code should throw error');
    } catch (error: any) {
      expect(error).to.be.instanceof(WebAssembly.RuntimeError);
      expect(error.message).to.equal('unreachable');
    }
  });

  it('should reinstantiate wasm', async () => {
    const instance = await instantiate(
      db,
      indexer,
      provider,
      {},
      module,
      dummyGraphData
    );

    exports = instance.exports;
    const { callGraphAPI } = exports;
    await callGraphAPI();
  });
});
