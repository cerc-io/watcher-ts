//
// Copyright 2023 Vulcanize, Inc.
//

import fs from 'fs';
import path from 'path';

// @ts-expect-error https://github.com/microsoft/TypeScript/issues/49721#issuecomment-1319854183
import { PeerIdObj } from '@cerc-io/peer';

export function readPeerId (filePath: string): PeerIdObj {
  const peerIdFilePath = path.resolve(filePath);
  console.log(`Reading peer id from file ${peerIdFilePath}`);

  const peerIdJson = fs.readFileSync(peerIdFilePath, 'utf-8');
  return JSON.parse(peerIdJson);
}
