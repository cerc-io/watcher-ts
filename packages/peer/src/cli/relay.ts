import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import fs from 'fs';
import path from 'path';

import { createFromJSON } from '@libp2p/peer-id-factory';
import type { PeerId } from '@libp2p/interface-peer-id';

import { createRelayNode } from '../relay.js';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 9090;
const DEFAULT_MAX_DIAL_RETRY = 5;

interface Arguments {
  host: string;
  port: number;
  announce?: string;
  peerIdFile?: string;
  relayPeers?: string;
  maxDialRetry: number;
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

  await createRelayNode(argv.host, argv.port, relayPeersList, argv.maxDialRetry, argv.announce, peerId);
}

function _getArgv (): any {
  return yargs(hideBin(process.argv)).parserConfiguration({
    'parse-numbers': false
  }).options({
    host: {
      type: 'string',
      alias: 'h',
      default: DEFAULT_HOST,
      describe: 'Host to bind to'
    },
    port: {
      type: 'number',
      alias: 'p',
      default: DEFAULT_PORT,
      describe: 'Port to start listening on'
    },
    announce: {
      type: 'string',
      alias: 'a',
      describe: 'Domain name to be used in the announce address'
    },
    peerIdFile: {
      type: 'string',
      alias: 'f',
      describe: 'Relay Peer Id file path (json)'
    },
    relayPeers: {
      type: 'string',
      alias: 'r',
      describe: 'Relay peer multiaddr(s) list file path (json)'
    },
    maxDialRetry: {
      type: 'number',
      describe: 'Maximum number of retries for dialling a relay peer',
      default: DEFAULT_MAX_DIAL_RETRY
    }
  // https://github.com/yargs/yargs/blob/main/docs/typescript.md?plain=1#L83
  }).parseSync();
}

main().catch(err => {
  console.log(err);
});
