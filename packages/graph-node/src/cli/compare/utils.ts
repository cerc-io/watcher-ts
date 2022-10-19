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
import debug from 'debug';

import { Config as CacheConfig, getCache } from '@cerc-io/cache';
import { GraphQLClient } from '@cerc-io/ipld-eth-client';
import { gql } from '@apollo/client/core';

import { Client } from './client';
import { DEFAULT_LIMIT } from '../../database';

const log = debug('vulcanize:compare-utils');

const STATE_QUERY = `
query getState($blockHash: String!, $contractAddress: String!, $kind: String){
  getState(blockHash: $blockHash, contractAddress: $contractAddress, kind: $kind){
    block {
      cid
      number
      hash
    }
    contractAddress
    cid
    kind
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
  names: { [queryName: string]: string };
  blockDelayInMs: number;
  queryLimits: { [queryName: string]: number }
}

interface EntitySkipFields {
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
    skipFields: EntitySkipFields[];
    contracts: string[];
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
  rawJson: boolean,
  timeDiff: boolean
): Promise<CompareResult> => {
  const { client1, client2 } = clients;

  const [
    { data: result1, time: time1 },
    { data: result2, time: time2 }
  ] = await Promise.all([
    client1.getResult(queryName, params),
    client2.getResult(queryName, params)
  ]);

  if (timeDiff) {
    log(`time:utils#compareQuery-${queryName}-${JSON.stringify(params)}-gql1-[${time1}ms]-gql2-[${time2}ms]-diff-[${time1 - time2}ms]`);
  }

  // Getting the diff of two result objects.
  const resultDiff = compareObjects(result1, result2, rawJson);

  return {
    diff: resultDiff,
    result1,
    result2
  };
};

export const getClients = async (config: Config, timeDiff: boolean, queryDir?: string):Promise<{
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
  }, timeDiff, queryDir);

  const client2 = new Client({
    gqlEndpoint: gqlEndpoint2,
    cache: endpoint === 'gqlEndpoint2' ? cache : undefined
  }, timeDiff, queryDir);

  return {
    client1,
    client2
  };
};

export const getStatesByBlock = async (client: GraphQLClient, contracts: string[], blockHash: string): Promise<{[key: string]: any}[][]> => {
  // Fetch States for all contracts
  return Promise.all(contracts.map(async contract => {
    const { getState } = await client.query(
      gql(STATE_QUERY),
      {
        blockHash,
        contractAddress: contract
      }
    );

    const states = [];

    // If 'checkpoint' is found at the same block, fetch 'diff' as well
    if (getState && getState.kind === 'checkpoint' && getState.block.hash === blockHash) {
      // Check if 'init' present at the same block
      const { getState: getInitState } = await client.query(
        gql(STATE_QUERY),
        {
          blockHash,
          contractAddress: contract,
          kind: 'init'
        }
      );

      if (getInitState && getInitState.block.hash === blockHash) {
        // Append the 'init' state to the result
        states.push(getInitState);
      }

      // Check if 'diff' state present at the same block
      const { getState: getDiffState } = await client.query(
        gql(STATE_QUERY),
        {
          blockHash,
          contractAddress: contract,
          kind: 'diff'
        }
      );

      if (getDiffState && getDiffState.block.hash === blockHash) {
        // Append the 'diff' state to the result
        states.push(getDiffState);
      }
    }

    // Append the state to the result
    states.push(getState);

    return states;
  }));
};

export const checkStateMetaData = (contractState: {[key: string]: any}, contractLatestStateCIDMap: Map<string, { diff: string, checkpoint: string }>, rawJson: boolean) => {
  // Return if State for a contract not found
  if (!contractState) {
    return;
  }

  const { contractAddress, cid, kind, block } = contractState;

  const parentCIDs = contractLatestStateCIDMap.get(contractAddress);
  assert(parentCIDs);

  // If CID is same as the parent CID, skip the check
  if (cid === parentCIDs.diff || cid === parentCIDs.checkpoint) {
    return;
  }

  // Update the parent CIDs in the map
  // Keep previous 'diff' if kind is 'checkpoint'
  const nextParentCIDs = (kind === 'checkpoint')
    ? { diff: parentCIDs.diff, checkpoint: cid as string }
    : { diff: cid, checkpoint: '' };
  contractLatestStateCIDMap.set(contractAddress, nextParentCIDs);

  // Actual meta data from the GQL result
  const data = JSON.parse(contractState.data);

  // If parentCID not initialized (is empty at start)
  // Take the expected parentCID from the actual data itself
  let parentCID: string;
  const actualParentCID = data.meta.parent['/'];
  if (parentCIDs.diff === '') {
    parentCID = actualParentCID;
  } else {
    // Check if actual parent CID points to previous 'checkpoint'
    parentCID = (parentCIDs.checkpoint !== '' && actualParentCID === parentCIDs.checkpoint)
      ? parentCIDs.checkpoint
      : parentCIDs.diff;
  }

  // Expected meta data
  const expectedMetaData = {
    id: contractAddress,
    kind,
    parent: {
      '/': parentCID
    },
    ethBlock: {
      cid: {
        '/': block.cid
      },
      num: block.number
    }
  };

  return compareObjects(expectedMetaData, data.meta, rawJson);
};

export const combineState = (contractStateEntries: {[key: string]: any}[]): {[key: string]: any} => {
  const contractStates: {[key: string]: any}[] = contractStateEntries.map(contractStateEntry => {
    if (!contractStateEntry) {
      return {};
    }

    const data = JSON.parse(contractStateEntry.data);

    // Apply default limit and sort by id on array type relation fields.
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
                  fieldValue.sort((a: any, b: any) => a.id.localeCompare(b.id));
                  fieldValue.splice(DEFAULT_LIMIT);
                }
              });
          });
      });

    return data.state;
  });

  return contractStates.reduce((acc, state) => _.merge(acc, state));
};

export const checkGQLEntityInState = async (
  state: {[key: string]: any},
  entityName: string,
  entityResult: {[key: string]: any},
  id: string,
  rawJson: boolean,
  skipFields: EntitySkipFields[] = []
): Promise<string> => {
  const stateEntity = state[entityName][id];

  // Filter __typename key in GQL result.
  entityResult = omitDeep(entityResult, '__typename');

  // Filter skipped fields in state comaparison.
  skipFields.forEach(({ entity, fields }) => {
    if (entityName === entity) {
      omitDeep(entityResult, fields);
      omitDeep(stateEntity, fields);
    }
  });

  const diff = compareObjects(entityResult, stateEntity, rawJson);

  return diff;
};

export const checkGQLEntitiesInState = async (
  state: {[key: string]: any},
  entityName: string,
  entitiesResult: any[],
  rawJson: boolean,
  skipFields: EntitySkipFields[] = []
): Promise<string> => {
  // Form entities from state to compare with GQL result
  const stateEntities = state[entityName];

  for (const entityResult of entitiesResult) {
    const stateEntity = stateEntities[entityResult.id];

    // Verify state if entity from GQL result is present in state.
    if (stateEntity) {
      // Filter __typename key in GQL result.
      entitiesResult = omitDeep(entityResult, '__typename');

      // Filter skipped fields in state comaparison.
      skipFields.forEach(({ entity, fields }) => {
        if (entityName === entity) {
          omitDeep(entityResult, fields);
          omitDeep(stateEntity, fields);
        }
      });

      const diff = compareObjects(entityResult, stateEntity, rawJson);

      if (diff) {
        return diff;
      }
    }
  }

  return '';
};

// obj1: expected
// obj2: actual
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
