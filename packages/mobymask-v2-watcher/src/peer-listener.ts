import debug from 'debug';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs';
import assert from 'assert';

import { Config, DEFAULT_CONFIG_PATH, getConfig, initClients } from '@cerc-io/util';
import {
  PeerInitConfig,
  PeerIdObj
  // @ts-expect-error https://github.com/microsoft/TypeScript/issues/49721#issuecomment-1319854183
} from '@cerc-io/peer';

import { getCurrentTime, sendMessageToL2 } from './libp2p-utils';
import { readPeerId } from '@cerc-io/cli';
import { ethers } from 'ethers';

const log = debug('vulcanize:peer-listener');

const DEFAULT_GAS_LIMIT = 500000;

interface Arguments {
  configFile: string;
  privateKey: string;
  contractAddress: string;
  gasLimit: number;
}

export const main = async (): Promise<any> => {
  const argv = _getArgv();
  const config: Config = await getConfig(argv.configFile);
  const { ethProvider } = await initClients(config);

  const p2pConfig = config.server.p2p;
  const peerConfig = p2pConfig.peer;
  assert(peerConfig, 'Peer config not set');

  const { Peer } = await import('@cerc-io/peer');

  let peerIdObj: PeerIdObj | undefined;
  if (peerConfig.peerIdFile) {
    peerIdObj = readPeerId(peerConfig.peerIdFile);
  }

  const peer = new Peer(peerConfig.relayMultiaddr, true);

  const peerNodeInit: PeerInitConfig = {
    pingInterval: peerConfig.pingInterval,
    pingTimeout: peerConfig.pingTimeout,
    maxRelayConnections: peerConfig.maxRelayConnections,
    relayRedialInterval: peerConfig.relayRedialInterval,
    maxConnections: peerConfig.maxConnections,
    dialTimeout: peerConfig.dialTimeout,
    enableDebugInfo: peerConfig.enableDebugInfo
  };

  await peer.init(peerNodeInit, peerIdObj);
  const wallet = new ethers.Wallet(argv.privateKey, ethProvider);

  peer.subscribeTopic(peerConfig.pubSubTopic, (peerId, data) => {
    log(`[${getCurrentTime()}] Received a message on mobymask P2P network from peer:`, peerId);

    // TODO: throttle message handler
    sendMessageToL2(wallet, argv, data);
  });

  log(`Peer ID: ${peer.peerId?.toString()}`);
};

const _getArgv = (): Arguments => {
  return yargs(hideBin(process.argv)).parserConfiguration({
    'parse-numbers': false
  }).options({
    configFile: {
      alias: 'config-file',
      describe: 'configuration file path (toml)',
      type: 'string',
      default: DEFAULT_CONFIG_PATH
    },
    privateKey: {
      alias: 'private-key',
      demandOption: true,
      describe: 'Private key of the account to use for eth_call',
      type: 'string'
    },
    contractAddress: {
      alias: 'contract',
      demandOption: true,
      describe: 'Address of MobyMask contract',
      type: 'string'
    },
    gasLimit: {
      alias: 'gas-limit',
      describe: 'Gas limit for eth txs',
      type: 'number',
      default: DEFAULT_GAS_LIMIT
    }
  // https://github.com/yargs/yargs/blob/main/docs/typescript.md?plain=1#L83
  }).parseSync();
};

main().then(() => {
  log('Starting peer...');
}).catch(err => {
  log(err);
});
