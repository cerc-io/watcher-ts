//
// Copyright 2022 Vulcanize, Inc.
//

import { VerifyCheckpointCmd } from '@cerc-io/cli';

import { Database } from '../../database';
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
  const createCheckpointCmd = new VerifyCheckpointCmd();
  await createCheckpointCmd.init(argv, Database, Indexer);

  await createCheckpointCmd.exec();
};
