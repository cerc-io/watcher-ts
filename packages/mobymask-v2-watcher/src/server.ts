//
// Copyright 2023 Vulcanize, Inc.
//

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import 'reflect-metadata';
import debug from 'debug';
import { ethers } from 'ethers';

import { ServerCmd } from '@cerc-io/cli';

import { createResolvers } from './resolvers';
import { Indexer } from './indexer';
import { Database } from './database';
import { createMessageToL2Handler, parseLibp2pMessage } from './libp2p-utils';

const log = debug('vulcanize:server');

export const main = async (): Promise<any> => {
  const serverCmd = new ServerCmd();
  await serverCmd.init(Database);
  await serverCmd.initIndexer(Indexer);

  let p2pMessageHandler = parseLibp2pMessage;
  const { enableL2Txs, l2TxsConfig } = serverCmd.config.server.p2p.peer;

  if (enableL2Txs) {
    assert(l2TxsConfig);
    const wallet = new ethers.Wallet(l2TxsConfig.privateKey, serverCmd.ethProvider);
    p2pMessageHandler = createMessageToL2Handler(wallet, l2TxsConfig);
  }

  const typeDefs = fs.readFileSync(path.join(__dirname, 'schema.gql')).toString();
  return serverCmd.exec(createResolvers, typeDefs, p2pMessageHandler);
};

main().then(() => {
  log('Starting server...');
}).catch(err => {
  log(err);
});
