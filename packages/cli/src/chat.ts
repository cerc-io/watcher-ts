//
// Copyright 2022 Vulcanize, Inc.
//

import * as readline from 'readline';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs';

// @ts-expect-error https://github.com/microsoft/TypeScript/issues/49721#issuecomment-1319854183
import { PeerId } from '@libp2p/interface-peer-id';

const TEST_TOPIC = 'test';
interface Arguments {
  relayNode: string;
}

async function main (): Promise<void> {
  const argv: Arguments = _getArgv();

  // https://adamcoster.com/blog/commonjs-and-esm-importexport-compatibility-examples#importing-esm-into-commonjs-cjs
  const { Peer } = await import('@cerc-io/peer');
  const peer = new Peer(argv.relayNode, true);
  await peer.init();

  peer.subscribeMessage((peerId: PeerId, message: string) => {
    console.log(`> ${peerId.toString()} > ${message}`);
  });

  peer.subscribeTopic(TEST_TOPIC, (peerId, data) => {
    console.log(`> ${peerId.toString()} > ${data}`);
  });

  console.log(`Peer ID: ${peer.peerId?.toString()}`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.on('line', (input: string) => {
    peer.broadcastMessage(input);
  });

  console.log('Reading input...');
}

function _getArgv (): any {
  return yargs(hideBin(process.argv)).parserConfiguration({
    'parse-numbers': false
  }).options({
    relayNode: {
      type: 'string',
      describe: 'Relay node URL',
      demandOption: true
    }
  }).argv;
}

main().catch(err => {
  console.log(err);
});
