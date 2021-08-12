//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import canonicalStringify from 'canonical-json';
import { ethers } from 'ethers';
import level from 'level';
import fs from 'fs-extra';
import path from 'path';
import debug from 'debug';

const log = debug('vulcanize:cache');

export interface Config {
  name: string;
  enabled: boolean;
  deleteOnStart: boolean;
}

export const getCache = async (config: Config): Promise<undefined | Cache> => {
  let cache;

  // Cache is optional.
  if (config) {
    const { name, enabled, deleteOnStart } = config;

    assert(name);

    const cacheDirPath = path.join(process.cwd(), 'out', `${name}.db`);
    await fs.ensureDir(cacheDirPath);

    // Delete cache on start.
    if (deleteOnStart) {
      await fs.emptyDir(cacheDirPath);
    }

    // Enable/disable flag for the cache.
    if (enabled) {
      cache = new Cache(name, cacheDirPath);
    }
  }

  return cache;
};

export class Cache {
  _db: any;
  _name: string;

  constructor (name: string, dirPath: string) {
    assert(name);
    assert(dirPath);

    this._name = name;
    this._db = level(dirPath, { valueEncoding: 'json' });
  }

  key (obj: any): string {
    return this._cacheKey(obj);
  }

  async get (obj: any): Promise<[any, boolean] | undefined> {
    const key = this._cacheKey(obj);

    try {
      const value = await this._db.get(key);

      log(`${this._name}: cache hit ${key}`);

      return [value, true];
    } catch (err) {
      log(`${this._name}: cache miss ${key}`);

      if (err.notFound) {
        return [undefined, false];
      }
    }
  }

  async put (obj: any, value: any): Promise<void> {
    await this._db.put(this._cacheKey(obj), value);
  }

  _cacheKey (obj: any): string {
    return ethers.utils.keccak256(Buffer.from(canonicalStringify(obj)));
  }
}
