//
// Copyright 2022 Vulcanize, Inc.
//

import { CreateCheckpointCmd } from '@cerc-io/cli';
import { getGraphDbAndWatcher } from '@cerc-io/graph-node';

import { Database, ENTITY_QUERY_TYPE_MAP, ENTITY_TO_LATEST_ENTITY_MAP } from '../../database';
import { Indexer } from '../../indexer';

export const command = 'create';

export const desc = 'Create checkpoint';

export const builder = {
  address: {
    type: 'string',
    require: true,
    demandOption: true,
    describe: 'Contract address to create the checkpoint for.'
  },
  blockHash: {
    type: 'string',
    describe: 'Blockhash at which to create the checkpoint.'
  }
};

export const handler = async (argv: any): Promise<void> => {
  const createCheckpointCmd = new CreateCheckpointCmd();
  await createCheckpointCmd.init(argv, Database);

  const { graphWatcher } = await getGraphDbAndWatcher(
    createCheckpointCmd.config.server,
    createCheckpointCmd.clients.ethClient,
    createCheckpointCmd.ethProvider,
    createCheckpointCmd.database.baseDatabase,
    ENTITY_QUERY_TYPE_MAP,
    ENTITY_TO_LATEST_ENTITY_MAP
  );

  await createCheckpointCmd.initIndexer(Indexer, graphWatcher);

  await createCheckpointCmd.exec();
};
