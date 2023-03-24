
//
// Copyright 2023 Vulcanize, Inc.
//

import { hideBin } from 'yargs/helpers';
import yargs from 'yargs';
import debug from 'debug';

import {
  PeerInitConfig,
  PeerIdObj
  // @ts-expect-error https://github.com/microsoft/TypeScript/issues/49721#issuecomment-1319854183
} from '@cerc-io/peer';

import { readPeerId } from './utils';

const log = debug('vulcanize:peer');

interface Arguments {
  relayMultiaddr: string;
  maxConnections: number;
  dialTimeout: number;
  maxRelayConnections: number;
  peerIdFile: string;
  enableDebugInfo: boolean;
}

export class PeerCmd {
  async exec (pubSubTopic?: string, parseLibp2pMessage?: (peerId: string, data: any) => void): Promise<any> {
    const argv: Arguments = _getArgv();

    const { Peer } = await import('@cerc-io/peer');
    const peer = new Peer(argv.relayMultiaddr, true);

    let peerIdObj: PeerIdObj | undefined;
    if (argv.peerIdFile) {
      peerIdObj = readPeerId(argv.peerIdFile);
    }

    const peerNodeInit: PeerInitConfig = {
      maxConnections: argv.maxConnections,
      dialTimeout: argv.dialTimeout,
      maxRelayConnections: argv.maxRelayConnections,
      enableDebugInfo: argv.enableDebugInfo
    };

    await peer.init(peerNodeInit, peerIdObj);
    log(`Peer ID: ${peer.peerId?.toString()}`);

    // Subscribe this peer to a pubsub topic if provided
    if (pubSubTopic) {
      peer.subscribeTopic(pubSubTopic, (peerId, data) => {
        if (parseLibp2pMessage) {
          parseLibp2pMessage(peerId.toString(), data);
        } else {
          log(`> ${peerId.toString()} > ${data}`);
        }
      });
    }

    return peer;
  }
}

function _getArgv (): any {
  return yargs(hideBin(process.argv)).parserConfiguration({
    'parse-numbers': false
  }).options({
    relayMultiaddr: {
      type: 'string',
      alias: 'r',
      describe: 'Multiaddr of the primary relay node for this peer',
      demandOption: true
    },
    maxConnections: {
      type: 'number',
      describe: 'Max number of connections for a peer'
    },
    dialTimeout: {
      type: 'number',
      describe: 'Timeout for dial to peers (ms)'
    },
    maxRelayConnections: {
      type: 'number',
      describe: 'Max number of relay node connections for a peer'
    },
    peerIdFile: {
      type: 'string',
      alias: 'f',
      describe: 'Peer id file path (json)'
    },
    enableDebugInfo: {
      type: 'boolean',
      describe: 'Whether to participate in exchanging debug info over floodsub',
      default: false
    }
  }).argv;
}
