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
  const argv: Arguments = _getArgv();

  const exportFilePath = path.resolve(argv.file);
  const exportFileDir = path.dirname(exportFilePath);

  const peerId = await createEd25519PeerId();
  assert(peerId.privateKey);

  const obj = {
    id: peerId.toString(),
    privKey: Buffer.from(peerId.privateKey).toString('base64'),
    pubKey: Buffer.from(peerId.publicKey).toString('base64')
  };

  if (!fs.existsSync(exportFileDir)) {
    fs.mkdirSync(exportFileDir, { recursive: true });
  }

  fs.writeFileSync(exportFilePath, JSON.stringify(obj));
  console.log(`Peer id ${peerId.toString()} exported to file ${exportFilePath}`);
}

function _getArgv (): any {
  return yargs(hideBin(process.argv)).parserConfiguration({
    'parse-numbers': false
  }).options({
    file: {
      type: 'string',
      alias: 'f',
      describe: 'Peer Id export file path (json)',
      demandOption: true
    }
  }).argv;
}

main().catch(err => {
  console.log(err);
});
