//
// Copyright 2022 Vulcanize, Inc.
//

import { ResetStateCmd } from '@cerc-io/cli';

import { Database } from '../../database';

export const command = 'state';

export const desc = 'Reset State to a given block number';

export const builder = {
  blockNumber: {
    type: 'number'
  }
};

export const handler = async (argv: any): Promise<void> => {
  const resetStateCmd = new ResetStateCmd();
  await resetStateCmd.init(argv, Database);

  await resetStateCmd.exec();
};
