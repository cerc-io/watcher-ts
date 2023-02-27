//
// Copyright 2022 Vulcanize, Inc.
//

import { PeerCmd } from './peer';

async function main (): Promise<void> {
  const peerCmd = new PeerCmd();
  await peerCmd.exec();
}

main().catch(err => {
  console.log(err);
});
