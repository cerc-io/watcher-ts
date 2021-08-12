//
// Copyright 2021 Vulcanize, Inc.
//

import 'mocha';
import { expect } from 'chai';
import { GraphQLClient } from 'graphql-request';

import { queryBundle } from '../queries';
import { Data } from './data';

describe('server', () => {
  const client = new GraphQLClient('http://localhost:3003/graphql');
  const data = Data.getInstance();

  it('query bundle', async () => {
    const { bundles } = data.entities;
    expect(bundles.length).to.be.greaterThan(0);

    for (let i = 0; i < bundles.length; i++) {
      const { id, blockNumber, ethPriceUSD } = bundles[i];

      // Bundle query.
      const result = await client.request(queryBundle, { id, blockNumber });
      expect(result.bundle.id).to.equal(id);
      expect(result.bundle.ethPriceUSD).to.equal(ethPriceUSD);
    }
  });
});
