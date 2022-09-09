//
// Copyright 2022 Vulcanize, Inc.
//

import assert from 'assert';
import util from 'util';
import path from 'path';
import toml from 'toml';
import fs from 'fs-extra';
import { diffString, diff } from 'json-diff';
import _ from 'lodash';
import omitDeep from 'omit-deep';

import { Config as CacheConfig, getCache } from '@cerc-io/cache';
import { GraphQLClient } from '@cerc-io/ipld-eth-client';
import { gql } from '@apollo/client/core';

import { Client } from './client';
import { DEFAULT_LIMIT } from '../../database';

const IPLD_STATE_QUERY = `
query getState($blockHash: String!, $contractAddress: String!, $kind: String){
  getState(blockHash: $blockHash, contractAddress: $contractAddress, kind: $kind){
    data
  }
}
`;

interface EndpointConfig {
  gqlEndpoint1: string;
  gqlEndpoint2: string;
  requestDelayInMs: number;
}

interface QueryConfig {
  queryDir: string;
  names: string[];
  blockDelayInMs: number;
  queryLimits: { [queryName: string]: number }
}

interface EntityDerivedFields {
  entity: string;
  fields: string[];
}

export interface Config {
  endpoints: EndpointConfig;
  queries: QueryConfig;
  watcher: {
    configPath: string;
    entitiesDir: string;
    verifyState: boolean;
    endpoint: keyof EndpointConfig;
    derivedFields: EntityDerivedFields[]
  }
  cache: {
    endpoint: keyof EndpointConfig;
    config: CacheConfig;
  }
}

export const getConfig = async (configFile: string): Promise<Config> => {
  const configFilePath = path.resolve(configFile);
  const fileExists = await fs.pathExists(configFilePath);

  if (!fileExists) {
    throw new Error(`Config file not found: ${configFilePath}`);
  }

  const config = toml.parse(await fs.readFile(configFilePath, 'utf8'));

  if (config.queries.queryDir) {
    // Resolve path from config file path.
    const configFileDir = path.dirname(configFilePath);
    config.queries.queryDir = path.resolve(configFileDir, config.queries.queryDir);
  }

  return config;
};

interface CompareResult {
  diff: string,
  result1: any,
  result2: any
}

export const compareQuery = async (
  clients: {
    client1: Client,
    client2: Client
  },
  queryName: string,
  params: { [key: string]: any },
  rawJson: boolean
): Promise<CompareResult> => {
  const { client1, client2 } = clients;

  const [result1, result2] = await Promise.all([
    client1.getResult(queryName, params),
    client2.getResult(queryName, params)
  ]);

  // Getting the diff of two result objects.
  const resultDiff = compareObjects(result1, result2, rawJson);

  return {
    diff: resultDiff,
    result1,
    result2
  };
};

export const getClients = async (config: Config, queryDir?: string):Promise<{
  client1: Client,
  client2: Client
}> => {
  assert(config.endpoints, 'Missing endpoints config');

  const {
    endpoints: { gqlEndpoint1, gqlEndpoint2 },
    cache: { endpoint, config: cacheConfig }
  } = config;

  assert(gqlEndpoint1, 'Missing endpoint one');
  assert(gqlEndpoint2, 'Missing endpoint two');

  if (!queryDir) {
    assert(config.queries, 'Missing queries config');
    queryDir = config.queries.queryDir;
  }

  assert(queryDir, 'Query directory not provided');
  assert(cacheConfig, 'Cache config not provided');
  const cache = await getCache(cacheConfig);

  const client1 = new Client({
    gqlEndpoint: gqlEndpoint1,
    cache: endpoint === 'gqlEndpoint1' ? cache : undefined
  }, queryDir);

  const client2 = new Client({
    gqlEndpoint: gqlEndpoint2,
    cache: endpoint === 'gqlEndpoint2' ? cache : undefined
  }, queryDir);

  return {
    client1,
    client2
  };
};

export const getBlockIPLDState = async (client: GraphQLClient, contracts: string[], blockHash: string): Promise<{[key: string]: any}> => {
  const contractIPLDStates: {[key: string]: any}[] = await Promise.all(contracts.map(async contract => {
    const { getState } = await client.query(
      gql(IPLD_STATE_QUERY),
      {
        blockHash,
        contractAddress: contract,
        kind: 'diff'
      }
    );

    if (getState) {
      const data = JSON.parse(getState.data);

      // Apply default limit on array type relation fields.
      Object.values(data.state)
        .forEach((idEntityMap: any) => {
          Object.values(idEntityMap)
            .forEach((entity: any) => {
              Object.values(entity)
                .forEach(fieldValue => {
                  if (
                    Array.isArray(fieldValue) &&
                    fieldValue.length &&
                    fieldValue[0].id
                  ) {
                    fieldValue.splice(DEFAULT_LIMIT);
                  }
                });
            });
        });

      return data.state;
    }

    return {};
  }));

  return contractIPLDStates.reduce((acc, state) => _.merge(acc, state));
};

export const checkEntityInIPLDState = async (
  ipldState: {[key: string]: any},
  queryName: string,
  entityResult: {[key: string]: any},
  id: string,
  rawJson: boolean,
  derivedFields: EntityDerivedFields[] = []
): Promise<string> => {
  const entityName = _.upperFirst(queryName);
  const ipldEntity = ipldState[entityName][id];

  // Filter __typename key in GQL result.
  const resultEntity = omitDeep(entityResult[queryName], '__typename');

  // Filter derived fields in GQL result.
  derivedFields.forEach(({ entity, fields }) => {
    if (entityName === entity) {
      fields.forEach(field => {
        delete resultEntity[field];
      });
    }
  });

  const diff = compareObjects(ipldEntity, resultEntity, rawJson);

  return diff;
};

const compareObjects = (obj1: any, obj2: any, rawJson: boolean): string => {
  if (rawJson) {
    const diffObj = diff(obj1, obj2);

    if (diffObj) {
      // Use util.inspect to extend depth limit in the output.
      return util.inspect(diffObj, false, null);
    }

    return '';
  } else {
    return diffString(obj1, obj2);
  }
};
