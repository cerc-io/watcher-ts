import * as readline from 'readline';

import { Peer } from '@cerc-io/peer';
import { PeerId } from '@libp2p/interface-peer-id';

async function main (): Promise<void> {
  const peer = new Peer(true);
  await peer.init();

  peer.subscribeMessage((peerId: PeerId, message: string) => {
    console.log(`> ${peerId.toString()} > ${message}`);
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

main().catch(err => {
  console.log(err);
});

// Run:
// $ yarn build
// $ yarn chat
