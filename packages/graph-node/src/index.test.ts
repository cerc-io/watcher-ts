//
// Copyright 2021 Vulcanize, Inc.
//

import path from 'path';

import { instantiate } from './index';

const WASM_FILE_PATH = '../build/debug.wasm';

it('should execute exported function', async () => {
  const filePath = path.resolve(__dirname, WASM_FILE_PATH);
  const { exports } = await instantiate(filePath);
  exports.callGraphAPI();
});
