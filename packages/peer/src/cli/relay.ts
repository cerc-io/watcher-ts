import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import fs from 'fs';
import path from 'path';

import { RelayNodeInit, createRelayNode } from '../relay.js';
import { PeerIdObj } from '../peer.js';
import { RELAY_DEFAULT_HOST, RELAY_DEFAULT_PORT, RELAY_DEFAULT_MAX_DIAL_RETRY } from '../constants.js';

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
  let peerIdObj: PeerIdObj | undefined;
  let relayPeersList: string[] = [];

  if (argv.peerIdFile) {
    const peerIdFilePath = path.resolve(argv.peerIdFile);
    console.log(`Reading peer id from file ${peerIdFilePath}`);

    const peerIdJson = fs.readFileSync(peerIdFilePath, 'utf-8');
    peerIdObj = JSON.parse(peerIdJson);
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

  const relayNodeInit: RelayNodeInit = {
    host: argv.host,
    port: argv.port,
    announceDomain: argv.announce,
    relayPeers: relayPeersList,
    maxDialRetry: argv.maxDialRetry,
    peerIdObj
  };
  await createRelayNode(relayNodeInit);
}

function _getArgv (): Arguments {
  return yargs(hideBin(process.argv)).parserConfiguration({
    'parse-numbers': false
  }).options({
    host: {
      type: 'string',
      alias: 'h',
      default: RELAY_DEFAULT_HOST,
      describe: 'Host to bind to'
    },
    port: {
      type: 'number',
      alias: 'p',
      default: RELAY_DEFAULT_PORT,
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
      describe: 'Maximum number of dial retries to be attempted to a relay peer',
      default: RELAY_DEFAULT_MAX_DIAL_RETRY
    }
  // https://github.com/yargs/yargs/blob/main/docs/typescript.md?plain=1#L83
  }).parseSync();
}

main().catch(err => {
  console.log(err);
});
