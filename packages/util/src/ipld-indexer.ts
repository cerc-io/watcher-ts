//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import { ethers } from 'ethers';
import { sha256 } from 'multiformats/hashes/sha2';
import { CID } from 'multiformats/cid';
import _ from 'lodash';

import { EthClient } from '@vulcanize/ipld-eth-client';
import * as codec from '@ipld/dag-cbor';

import { IPLDDatabaseInterface, BlockProgressInterface } from './types';
import { Indexer } from './indexer';

export class IPLDIndexer extends Indexer {
  _ipldDb: IPLDDatabaseInterface;

  constructor (ipldDb: IPLDDatabaseInterface, ethClient: EthClient, postgraphileClient: EthClient, ethProvider: ethers.providers.BaseProvider) {
    super(ipldDb, ethClient, postgraphileClient, ethProvider);
    this._ipldDb = ipldDb;
  }

  async prepareIPLDBlock (block: BlockProgressInterface, contractAddress: string, data: any, kind: string):Promise<any> {
    assert(_.includes(['init', 'diff', 'checkpoint', 'diff_staged'], kind));

    // Get an existing 'init' | 'diff' | 'diff_staged' | 'checkpoint' IPLDBlock for current block, contractAddress.
    const currentIPLDBlocks = await this._ipldDb.getIPLDBlocks({ block, contractAddress, kind });

    // There can be at most one IPLDBlock for a (block, contractAddress, kind) combination.
    assert(currentIPLDBlocks.length <= 1);
    const currentIPLDBlock = currentIPLDBlocks[0];

    // Update currentIPLDBlock of same kind if it exists.
    let ipldBlock;
    if (currentIPLDBlock) {
      ipldBlock = currentIPLDBlock;

      // Update the data field.
      const oldData = codec.decode(Buffer.from(currentIPLDBlock.data));
      data = _.merge(oldData, data);
    } else {
      ipldBlock = this._ipldDb.getNewIPLDBlock();

      // Fetch the parent IPLDBlock.
      const parentIPLDBlock = await this._ipldDb.getLatestIPLDBlock(contractAddress, null, block.blockNumber);

      // Setting the meta-data for an IPLDBlock (done only once per block).
      data.meta = {
        id: contractAddress,
        kind,
        parent: {
          '/': parentIPLDBlock ? parentIPLDBlock.cid : null
        },
        ethBlock: {
          cid: {
            '/': block.cid
          },
          num: block.blockNumber
        }
      };
    }

    // Encoding the data using dag-cbor codec.
    const bytes = codec.encode(data);

    // Calculating sha256 (multi)hash of the encoded data.
    const hash = await sha256.digest(bytes);

    // Calculating the CID: v1, code: dag-cbor, hash.
    const cid = CID.create(1, codec.code, hash);

    // Update ipldBlock with new data.
    ipldBlock = Object.assign(ipldBlock, {
      block,
      contractAddress,
      cid: cid.toString(),
      kind: data.meta.kind,
      data: Buffer.from(bytes)
    });

    return ipldBlock;
  }
}
