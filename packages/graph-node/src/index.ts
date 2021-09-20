//
// Copyright 2021 Vulcanize, Inc.
//

import fs from 'fs/promises';
import loader from '@assemblyscript/loader';

const imports = { /* imports go here */ };

export const getExports = async (filePath: string): Promise<loader.ResultObject & { exports: any }> => {
  const buffer = await fs.readFile(filePath);
  return loader.instantiate(buffer, imports);
};
