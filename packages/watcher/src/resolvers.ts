import assert from 'assert';
import BigInt from 'apollo-type-bigint';
import debug from 'debug';
import fs from 'fs-extra';
import path from 'path';
import "reflect-metadata";
import { createConnection } from "typeorm";

import { getCache } from '@vulcanize/cache';
import { EthClient } from '@vulcanize/ipld-eth-client';

import { Indexer } from './indexer';

const log = debug('vulcanize:resolver');

export const createResolvers = async (config) => {

  const ormConfig = JSON.parse(await fs.readFile(path.join(process.cwd(), "ormconfig.json")));
  const db = await createConnection(ormConfig);

  const { upstream } = config;
  assert(upstream, 'Missing upstream config');

  const { gqlEndpoint, cache: cacheConfig } = upstream;
  assert(upstream, 'Missing upstream gqlEndpoint');

  const cache = await getCache(cacheConfig);
  const ethClient = new EthClient({ gqlEndpoint, cache });

  const indexer = new Indexer(db, ethClient);

  return {
    BigInt: new BigInt('bigInt'),

    TokenEvent: {
      __resolveType: (obj) => {
        if (obj.owner) {
          return 'ApprovalEvent';
        }

        return 'TransferEvent';
      }
    },

    Query: {

      balanceOf: async (_, { blockHash, token, owner }) => {
        log('balanceOf', blockHash, token, owner);
        return indexer.getBalanceOf(blockHash, token, owner);
      },

      allowance: async (_, { blockHash, token, owner, spender }) => {
        log('allowance', blockHash, token, owner, spender);
        return indexer.getAllowance(blockHash, token, owner, spender);
      },

      events: async (_, { blockHash, token, name }) => {
        log('events', blockHash, token, name);
        return indexer.getEvents(blockHash, token, name);
      }
    }
  };
};
