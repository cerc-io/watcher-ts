import { hideBin } from 'yargs/helpers';
import yargs from 'yargs';
import fs from 'fs';
import path from 'path';

import { createFromJSON } from '@libp2p/peer-id-factory';
import type { PeerId } from '@libp2p/interface-peer-id';

import { createRelayNode, DEFAULT_PORT } from '../relay.js';

interface Arguments {
  port: number;
  peerIdFile: string;
  relayPeers: string;
}

async function main (): Promise<void> {
  const argv: Arguments = _getArgv();
  let peerId: PeerId | undefined;
  let relayPeersList: string[] = [];

  if (argv.peerIdFile) {
    const peerIdFilePath = path.resolve(argv.peerIdFile);
    console.log(`Reading peer id from file ${peerIdFilePath}`);

    const peerIdObj = fs.readFileSync(peerIdFilePath, 'utf-8');
    const peerIdJson = JSON.parse(peerIdObj);
    peerId = await createFromJSON(peerIdJson);
  } else {
    console.log('Creating a new peer id');
  }

  if (argv.relayPeers) {
    const relayPeersFilePath = path.resolve(argv.relayPeers);

    if (!fs.existsSync(relayPeersFilePath)) {
      console.log(`File at given path ${relayPeersFilePath} not found, exiting`);
      process.exit();
    }

    console.log(`Reading relay peer multiaddr(s) from file ${relayPeersFilePath}`);
    const relayPeersListObj = fs.readFileSync(relayPeersFilePath, 'utf-8');
    relayPeersList = JSON.parse(relayPeersListObj);
  }

  const listenPort = argv.port ? argv.port : DEFAULT_PORT;

  await createRelayNode(listenPort, relayPeersList, peerId);
}

function _getArgv (): any {
  return yargs(hideBin(process.argv)).parserConfiguration({
    'parse-numbers': false
  }).options({
    port: {
      type: 'number',
      describe: 'Port to start listening on'
    },
    peerIdFile: {
      type: 'string',
      describe: 'Relay Peer Id file path (json)'
    },
    relayPeers: {
      type: 'string',
      describe: 'Relay peer multiaddr(s) list file path (json)'
    }
  }).argv;
}

main().catch(err => {
  console.log(err);
});
