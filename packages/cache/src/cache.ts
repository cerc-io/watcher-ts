import assert from 'assert';
import canonicalStringify from 'canonical-json';
import { ethers } from 'ethers';
import level from 'level';
import fs from 'fs-extra';
import path from 'path';
import debug from 'debug';

const log = debug('vulcanize:cache');

export const getCache = async (config) => {
  let cache;

  // Cache is optional.
  if (config) {
    log("config", JSON.stringify(config, null, 2));

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

  constructor(name, dirPath) {
    assert(name);
    assert(dirPath);

    this._name = name;
    this._db = level(dirPath, { valueEncoding: 'json' });;
  }

  key(obj) {
    return this._cacheKey(obj);
  }

  async get(obj) {
    const key = this._cacheKey(obj);

    try {
      const value = await this._db.get(key);

      log(`${this._name}: cache hit ${key}`);

      return [value, true];
    } catch (err) {
      log(`${this._name}: cache miss ${key}`);

      if (err.notFound) {
        return [undefined, false]
      }
    }
  }

  async put(obj, value) {
    await this._db.put(this._cacheKey(obj), value);
  }

  _cacheKey(obj) {
    return ethers.utils.keccak256(Buffer.from(canonicalStringify(obj)));
  }
}
