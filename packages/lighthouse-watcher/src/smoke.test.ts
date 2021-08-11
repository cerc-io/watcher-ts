import { expect } from 'chai';
import assert from 'assert';
import { ethers, Contract, ContractTransaction, Signer, utils } from 'ethers';
import 'mocha';

import {
  getConfig
} from '@vulcanize/util';

import lighthouseABI from './abi/Lighthouse.json';
import { Config } from './indexer';
import { Client } from './client';

const NETWORK_RPC_URL = 'http://localhost:8545';

describe('lighthouse-watcher', () => {
  let lighthouse: Contract;

  let config: Config;
  let signer: Signer;
  let client: Client;

  before(async () => {
    const configFile = './environments/local.toml';
    config = await getConfig(configFile);

    const { server: { host, port }, watch } = config;
    assert(watch);

    const endpoint = `http://${host}:${port}/graphql`;
    const gqlEndpoint = endpoint;
    const gqlSubscriptionEndpoint = endpoint;
    client = new Client({
      gqlEndpoint,
      gqlSubscriptionEndpoint
    });

    const provider = new ethers.providers.JsonRpcProvider(NETWORK_RPC_URL);
    signer = provider.getSigner();
    lighthouse = new Contract(watch.lighthouse, lighthouseABI, signer);
  });

  it('should trigger StorageRequest event', done => {
    (async () => {
      const cid = 'testCid';
      const config = 'testConfig';
      const fileCost = '10';
      const signerAddress = await signer.getAddress();

      // Subscribe using UniClient.
      const subscription = await client.watchEvents((value: any) => {
        if (value.event.__typename === 'StorageRequestEvent') {
          expect(value.event.uploader).to.equal(signerAddress);
          expect(value.event.cid).to.equal(cid);
          expect(value.event.config).to.equal(config);
          expect(value.event.fileCost).to.equal(fileCost);

          if (subscription) {
            subscription.unsubscribe();
          }

          done();
        }
      });

      // Pool mint.
      const value = utils.parseUnits(fileCost, 'wei');
      const transaction: ContractTransaction = await lighthouse.store(cid, config, { value });
      await transaction.wait();
    })().catch((error) => {
      done(error);
    });
  });
});
