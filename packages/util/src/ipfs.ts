//
// Copyright 2021 Vulcanize, Inc.
//

import { create, IPFSHTTPClient } from 'ipfs-http-client';

export class IPFSClient {
  _client: IPFSHTTPClient;

  constructor (url: string) {
    this._client = create({ url });
  }

  async push (data: any): Promise<void> {
    await this._client.dag.put(data, { storeCodec: 'dag-cbor', hashAlg: 'sha2-256' });
  }
}
