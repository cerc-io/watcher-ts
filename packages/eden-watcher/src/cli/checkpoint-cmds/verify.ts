//
// Copyright 2022 Vulcanize, Inc.
//

import { VerifyCheckpointCmd } from '@cerc-io/cli';
import { getGraphDbAndWatcher } from '@cerc-io/graph-node';

import { Database, ENTITY_QUERY_TYPE_MAP, ENTITY_TO_LATEST_ENTITY_MAP } from '../../database';
import { Indexer } from '../../indexer';

export const command = 'verify';

export const desc = 'Verify checkpoint';

export const builder = {
  cid: {
    type: 'string',
    alias: 'c',
    demandOption: true,
    describe: 'Checkpoint CID to be verified'
  }
};

export const handler = async (argv: any): Promise<void> => {
  const verifyCheckpointCmd = new VerifyCheckpointCmd();
  await verifyCheckpointCmd.init(argv, Database);

  const { graphWatcher, graphDb } = await getGraphDbAndWatcher(
    verifyCheckpointCmd.config.server,
    verifyCheckpointCmd.clients.ethClient,
    verifyCheckpointCmd.ethProvider,
    verifyCheckpointCmd.database.baseDatabase,
    ENTITY_QUERY_TYPE_MAP,
    ENTITY_TO_LATEST_ENTITY_MAP
  );

  await verifyCheckpointCmd.initIndexer(Indexer, graphWatcher);

  await verifyCheckpointCmd.exec(graphDb);
};
