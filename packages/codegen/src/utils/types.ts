//
// Copyright 2021 Vulcanize, Inc.
//

export interface Param {
  name: string;
  type: string;
}

export const bannedTypes = new Set([
  'Symbol'
]);
