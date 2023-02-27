//
// Copyright 2022 Vulcanize, Inc.
//

import * as readline from 'readline';
import debug from 'debug';

// @ts-expect-error https://github.com/microsoft/TypeScript/issues/49721#issuecomment-1319854183
import { PeerId } from '@libp2p/interface-peer-id';

import { PeerCmd } from './peer';

const log = debug('vulcanize:chat');

const TEST_TOPIC = 'test';

async function main (): Promise<void> {
  const peerCmd = new PeerCmd();
  const peer = await peerCmd.exec(TEST_TOPIC);

  peer.subscribeMessage((peerId: PeerId, message: string) => {
    log(`> ${peerId.toString()} > ${message}`);
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.on('line', (input: string) => {
    peer.broadcastMessage(input);
  });

  log('Reading input...');
}

main().catch(err => {
  console.log(err);
});
