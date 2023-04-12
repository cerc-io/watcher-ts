//
// Copyright 2022 Vulcanize, Inc.
//

import { CreateCheckpointCmd } from '@cerc-io/cli';

import { Database } from '../../database';
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

  await createCheckpointCmd.initIndexer(Indexer);

  await createCheckpointCmd.exec();
};
