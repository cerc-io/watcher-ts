//
// Copyright 2023 Vulcanize, Inc.
//

import fs from 'fs';
import path from 'path';
import 'reflect-metadata';
import debug from 'debug';
import { ethers } from 'ethers';

import { ServerCmd } from '@cerc-io/cli';

import { createResolvers } from './resolvers';
import { Indexer } from './indexer';
import { Database } from './database';
import { abi as PhisherRegistryABI } from './artifacts/PhisherRegistry.json';

const log = debug('vulcanize:server');

const contractInterface = new ethers.utils.Interface(PhisherRegistryABI);

export const main = async (): Promise<any> => {
  const serverCmd = new ServerCmd();
  await serverCmd.init(Database);
  await serverCmd.initIndexer(Indexer);

  const typeDefs = fs.readFileSync(path.join(__dirname, 'schema.gql')).toString();
  return serverCmd.exec(createResolvers, typeDefs, parseLibp2pMessage);
};

const MESSAGE_KINDS = {
  INVOKE: 'invoke',
  REVOKE: 'revoke'
};

function parseLibp2pMessage (peerId: string, data: any): void {
  log('Received a message on mobymask P2P network from peer:', peerId);
  const { kind, message } = data;

  switch (kind) {
    case MESSAGE_KINDS.INVOKE: {
      _parseInvocation(message);
      break;
    }

    case MESSAGE_KINDS.REVOKE: {
      _parseRevocation(message);
      break;
    }

    default: {
      log(`libp2p message of unknown kind ${kind}`);
      log(JSON.stringify(message, null, 2));
      break;
    }
  }

  log('------------------------------------------');
}

function _parseInvocation (msg: any): void {
  log('Signed invocations:');
  log(JSON.stringify(msg, null, 2));

  const [{ invocations: { batch: invocationsList } }] = msg;
  Array.from(invocationsList).forEach((invocation: any) => {
    const txData = invocation.transaction.data;
    const decoded = contractInterface.parseTransaction({ data: txData });

    log(`method: ${decoded.name}, value: ${decoded.args[0]}`);
  });
}

function _parseRevocation (msg: any): void {
  const { signedDelegation, signedIntendedRevocation } = msg;
  log('Signed delegation:');
  log(JSON.stringify(signedDelegation, null, 2));
  log('Signed intention to revoke:');
  const stringifiedSignedIntendedRevocation = JSON.stringify(
    signedIntendedRevocation,
    (key, value) => {
      if (key === 'delegationHash' && value.type === 'Buffer') {
        // Show hex value for delegationHash instead of Buffer
        return ethers.utils.hexlify(Buffer.from(value));
      }

      return value;
    },
    2
  );
  log(stringifiedSignedIntendedRevocation);
}

main().then(() => {
  log('Starting server...');
}).catch(err => {
  log(err);
});
