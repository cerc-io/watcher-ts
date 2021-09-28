//
// Copyright 2021 Vulcanize, Inc.
//

import path from 'path';
import { expect } from 'chai';

import { instantiate } from './index';

const WASM_FILE_PATH = '../build/debug.wasm';

describe('wasm loader tests', () => {
  let exports: any;

  before(async () => {
    const filePath = path.resolve(__dirname, WASM_FILE_PATH);
    const instance = await instantiate(filePath);
    exports = instance.exports;
  });

  it('should execute exported function', async () => {
    const { callGraphAPI } = exports;
    callGraphAPI();
  });

  it('should use a class/instance created in wasm from JS', async () => {
    const { Foo, __getString, __pin, __unpin } = exports;

    const fooPtr = __pin(Foo.getFoo());
    const foo = Foo.wrap(fooPtr);
    const strPtr = foo.getString();
    expect(__getString(strPtr)).to.equal('hello world!');
    __unpin(fooPtr);
  });

  it('should instantiate a class in wasm from JS', async () => {
    const { Foo, FooID, __getString, __new, __pin, __unpin } = exports;

    const fooPtr = __pin(__new(FooID));
    const foo = Foo.wrap(fooPtr);
    const strPtr = foo.getString();
    expect(__getString(strPtr)).to.equal('hello world!');
    __unpin(fooPtr);
  });
});
