//
// Copyright 2021 Vulcanize, Inc.
//

import { expect } from 'chai';
import path from 'path';
import 'mocha';

import { getExports } from './index';

const WASM_FILE_PATH = '../build/untouched.wasm';

it('should execute exported function', async () => {
  const filePath = path.resolve(__dirname, WASM_FILE_PATH);
  const { exports } = await getExports(filePath);
  expect(exports.add(1, 2)).to.equal(3);
});
