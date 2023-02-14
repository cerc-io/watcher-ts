//
// Copyright 2023 Vulcanize, Inc.
//

import fs from 'fs';
import path from 'path';

// TODO: Import PeerIdObj type from @cerc-io/peer
// import { PeerIdObj } from '@cerc-io/peer';

export function readPeerId (filePath: string): any {
  const peerIdFilePath = path.resolve(filePath);
  console.log(`Reading peer id from file ${peerIdFilePath}`);

  const peerIdJson = fs.readFileSync(peerIdFilePath, 'utf-8');
  return JSON.parse(peerIdJson);
}
