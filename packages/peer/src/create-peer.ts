//
// Copyright 2022 Vulcanize, Inc.
//

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs';

import { createEd25519PeerId } from '@libp2p/peer-id-factory';

interface Arguments {
  file: string;
}

async function main (): Promise<void> {
  const peerId = await createEd25519PeerId();
  assert(peerId.privateKey);

  const obj = {
    id: peerId.toString(),
    privKey: Buffer.from(peerId.privateKey).toString('base64'),
    pubKey: Buffer.from(peerId.publicKey).toString('base64')
  };

  const argv: Arguments = _getArgv();
  if (argv.file) {
    const exportFilePath = path.resolve(argv.file);
    const exportFileDir = path.dirname(exportFilePath);

    if (!fs.existsSync(exportFileDir)) {
      fs.mkdirSync(exportFileDir, { recursive: true });
    }

    fs.writeFileSync(exportFilePath, JSON.stringify(obj, null, 2));
    console.log(`Peer id ${peerId.toString()} exported to file ${exportFilePath}`);
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
