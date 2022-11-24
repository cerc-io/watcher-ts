//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import 'reflect-metadata';
import debug from 'debug';

import { FillCmd } from '@cerc-io/cli';
import { getContractEntitiesMap } from '@cerc-io/graph-node';

import { Database, ENTITY_QUERY_TYPE_MAP, ENTITY_TO_LATEST_ENTITY_MAP } from './database';
import { Indexer } from './indexer';
import { EventWatcher } from './events';

const log = debug('vulcanize:fill');

export const main = async (): Promise<any> => {
  const fillCmd = new FillCmd();
  await fillCmd.init(Database, Indexer, EventWatcher, {}, ENTITY_QUERY_TYPE_MAP, ENTITY_TO_LATEST_ENTITY_MAP);

  const indexer = fillCmd.indexer as Indexer;
  assert(indexer);

  // Get contractEntitiesMap required for fill-state
  // NOTE: Assuming each entity type is only mapped to a single contract
  //       This is true for eden subgraph; may not be the case for other subgraphs
  const contractEntitiesMap = getContractEntitiesMap(indexer.graphWatcher.dataSources);

  await fillCmd.exec(contractEntitiesMap);
};

main().catch(err => {
  log(err);
}).finally(() => {
  process.exit();
});
