import debug from 'debug';

import { PeerCmd } from '@cerc-io/cli';

import { parseLibp2pMessage } from '../libp2p-utils';

const log = debug('vulcanize:peer');

const MOBYMASK_TOPIC = 'mobymask';

export const main = async (): Promise<any> => {
  const peerCmd = new PeerCmd();
  await peerCmd.exec(MOBYMASK_TOPIC, parseLibp2pMessage);
};

main().then(() => {
  log('Starting peer...');
}).catch(err => {
  log(err);
});
