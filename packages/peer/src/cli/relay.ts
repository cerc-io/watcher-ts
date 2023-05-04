import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import fs from 'fs';
import path from 'path';

import { RelayNodeInitConfig, createRelayNode } from '../relay.js';
import { PeerIdObj } from '../peer.js';
import {
  RELAY_DEFAULT_HOST,
  RELAY_DEFAULT_PORT,
  RELAY_DEFAULT_MAX_DIAL_RETRY,
  RELAY_REDIAL_INTERVAL,
  DEFAULT_PING_INTERVAL,
  DIAL_TIMEOUT
} from '../constants.js';

interface Arguments {
  host: string;
  port: number;
  announce?: string;
  peerIdFile?: string;
  relayPeers?: string;
  denyMultiaddrs?: string;
  dialTimeout: number;
  pingInterval: number;
  redialInterval: number;
  maxDialRetry: number;
  enableDebugInfo?: boolean;
}

async function main (): Promise<void> {
  const argv: Arguments = _getArgv();
  let peerIdObj: PeerIdObj | undefined;
  let relayPeersList: string[] = [];
  let denyMultiaddrsList: string[] = [];

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

  if (argv.denyMultiaddrs) {
    const denyMultiaddrsFilePath = path.resolve(argv.denyMultiaddrs);

    if (!fs.existsSync(denyMultiaddrsFilePath)) {
      console.log(`File at given path ${denyMultiaddrsFilePath} not found, exiting`);
      process.exit();
    }

    console.log(`Reading blacklisted multiaddr(s) from file ${denyMultiaddrsFilePath}`);
    const denyMultiaddrsListObj = fs.readFileSync(denyMultiaddrsFilePath, 'utf-8');
    denyMultiaddrsList = JSON.parse(denyMultiaddrsListObj);
  }

  const relayNodeInit: RelayNodeInitConfig = {
    host: argv.host,
    port: argv.port,
    peerIdObj,
    announceDomain: argv.announce,
    relayPeers: relayPeersList,
    denyMultiaddrs: denyMultiaddrsList,
    dialTimeout: argv.dialTimeout,
    pingInterval: argv.pingInterval,
    redialInterval: argv.redialInterval,
    maxDialRetry: argv.maxDialRetry,
    enableDebugInfo: argv.enableDebugInfo
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
    denyMultiaddrs: {
      type: 'string',
      describe: 'Blacklisted multiaddr(s) list file path (json)'
    },
    pingInterval: {
      type: 'number',
      describe: 'Interval to check relay peer connections using ping (ms)',
      default: DEFAULT_PING_INTERVAL
    },
    dialTimeout: {
      type: 'number',
      describe: 'Timeout for dial to relay peers (ms)',
      default: DIAL_TIMEOUT
    },
    redialInterval: {
      type: 'number',
      describe: 'Redial interval to relay peer on connection failure (ms)',
      default: RELAY_REDIAL_INTERVAL
    },
    maxDialRetry: {
      type: 'number',
      describe: 'Maximum number of dial retries to be attempted to a relay peer',
      default: RELAY_DEFAULT_MAX_DIAL_RETRY
    },
    enableDebugInfo: {
      type: 'boolean',
      describe: "Whether to broadcast node's info over floodsub on request"
    }
  // https://github.com/yargs/yargs/blob/main/docs/typescript.md?plain=1#L83
  }).parseSync();
}

main().catch(err => {
  console.log(err);
});
