//
// Copyright 2022 Vulcanize, Inc.
//

import fs from 'fs';
import path from 'path';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs';

import { createPeerId } from './index.js';

interface Arguments {
  file: string;
}

async function main (): Promise<void> {
  const obj = await createPeerId();

  const argv: Arguments = _getArgv();
  if (argv.file) {
    const exportFilePath = path.resolve(argv.file);
    const exportFileDir = path.dirname(exportFilePath);

    if (!fs.existsSync(exportFileDir)) {
      fs.mkdirSync(exportFileDir, { recursive: true });
    }

    fs.writeFileSync(exportFilePath, JSON.stringify(obj, null, 2));
    console.log(`Peer id ${obj.id.toString()} exported to file ${exportFilePath}`);
  } else {
    console.log(obj);
  }
}

function _getArgv (): any {
  return yargs(hideBin(process.argv)).parserConfiguration({
    'parse-numbers': false
  }).options({
    file: {
      type: 'string',
      alias: 'f',
      describe: 'Peer Id export file path (json)'
    }
  }).argv;
}

main().catch(err => {
  console.log(err);
});
