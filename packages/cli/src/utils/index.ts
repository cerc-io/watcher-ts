//
// Copyright 2023 Vulcanize, Inc.
//

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { providers } from 'ethers';

// @ts-expect-error https://github.com/microsoft/TypeScript/issues/49721#issuecomment-1319854183
import { PeerIdObj } from '@cerc-io/peer';
import { Config, EthClient, getCustomProvider } from '@cerc-io/util';
import { getCache } from '@cerc-io/cache';
import { EthClient as GqlEthClient } from '@cerc-io/ipld-eth-client';
import { EthClient as RpcEthClient } from '@cerc-io/rpc-eth-client';

export function readPeerId (filePath: string): PeerIdObj {
  const peerIdFilePath = path.resolve(filePath);
  console.log(`Reading peer id from file ${peerIdFilePath}`);

  const peerIdJson = fs.readFileSync(peerIdFilePath, 'utf-8');
  return JSON.parse(peerIdJson);
}

export const initClients = async (config: Config): Promise<{
  ethClient: EthClient,
  ethProvider: providers.JsonRpcProvider
}> => {
  const { database: dbConfig, upstream: upstreamConfig, server: serverConfig } = config;

  assert(serverConfig, 'Missing server config');
  assert(dbConfig, 'Missing database config');
  assert(upstreamConfig, 'Missing upstream config');

  const { ethServer: { gqlApiEndpoint, rpcProviderEndpoint, rpcClient = false }, cache: cacheConfig } = upstreamConfig;

  assert(rpcProviderEndpoint, 'Missing upstream ethServer.rpcProviderEndpoint');

  const cache = await getCache(cacheConfig);

  let ethClient: EthClient;

  if (rpcClient) {
    ethClient = new RpcEthClient({
      rpcEndpoint: rpcProviderEndpoint,
      cache
    });
  } else {
    assert(gqlApiEndpoint, 'Missing upstream ethServer.gqlApiEndpoint');

    ethClient = new GqlEthClient({
      gqlEndpoint: gqlApiEndpoint,
      cache
    });
  }

  const ethProvider = getCustomProvider({
    url: rpcProviderEndpoint,
    allowGzip: true
  });

  return {
    ethClient,
    ethProvider
  };
};
