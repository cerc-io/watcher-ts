import assert from 'assert';
import BigInt from 'apollo-type-bigint';
import debug from 'debug';
import 'reflect-metadata';
import { ConnectionOptions } from 'typeorm';

import { getCache, Config as CacheConfig } from '@vulcanize/cache';
import { EthClient } from '@vulcanize/ipld-eth-client';

import artifacts from './artifacts/ERC20.json';
import { Indexer, ValueResult } from './indexer';
import { Database } from './database';

export interface Config {
  server: {
    host: string;
    port: string;
  };
  database: ConnectionOptions;
  upstream: {
    gqlEndpoint: string;
    cache: CacheConfig
  }
}

const log = debug('vulcanize:resolver');

export const createResolvers = async (config: Config): Promise<any> => {
  const { upstream, database } = config;

  assert(database, 'Missing database config');

  const ormConfig: ConnectionOptions = {
    ...database,
    entities: [
      'src/entity/**/*.ts'
    ],
    migrations: [
      'src/migration/**/*.ts'
    ],
    subscribers: [
      'src/subscriber/**/*.ts'
    ],
    cli: {
      entitiesDir: 'src/entity',
      migrationsDir: 'src/migration',
      subscribersDir: 'src/subscriber'
    }
  };

  const db = new Database(ormConfig);
  await db.init();

  assert(upstream, 'Missing upstream config');

  const { gqlEndpoint, cache: cacheConfig } = upstream;
  assert(upstream, 'Missing upstream gqlEndpoint');

  const cache = await getCache(cacheConfig);
  assert(cache, 'Missing cache');

  const ethClient = new EthClient({ gqlEndpoint, cache });

  const indexer = new Indexer(db, ethClient, artifacts);

  return {
    BigInt: new BigInt('bigInt'),

    TokenEvent: {
      __resolveType: (obj: any) => {
        if (obj.owner) {
          return 'ApprovalEvent';
        }

        return 'TransferEvent';
      }
    },

    Query: {

      totalSupply: (_: any, { blockHash, token }: { blockHash: string, token: string }): Promise<ValueResult> => {
        log('totalSupply', blockHash, token);
        return indexer.totalSupply(blockHash, token);
      },

      balanceOf: async (_: any, { blockHash, token, owner }: { blockHash: string, token: string, owner: string }) => {
        log('balanceOf', blockHash, token, owner);
        return indexer.balanceOf(blockHash, token, owner);
      },

      allowance: async (_: any, { blockHash, token, owner, spender }: { blockHash: string, token: string, owner: string, spender: string }) => {
        log('allowance', blockHash, token, owner, spender);
        return indexer.allowance(blockHash, token, owner, spender);
      },

      name: (_: any, { blockHash, token }: { blockHash: string, token: string }) => {
        log('name', blockHash, token);
        return indexer.name(blockHash, token);
      },

      symbol: (_: any, { blockHash, token }: { blockHash: string, token: string }) => {
        log('symbol', blockHash, token);
        return indexer.symbol(blockHash, token);
      },

      decimals: (_: any, { blockHash, token }: { blockHash: string, token: string }) => {
        log('decimals', blockHash, token);
        return indexer.decimals();
      },

      events: async (_: any, { blockHash, token, name }: { blockHash: string, token: string, name: string }) => {
        log('events', blockHash, token, name);
        return indexer.getEvents(blockHash, token, name);
      }
    }
  };
};
