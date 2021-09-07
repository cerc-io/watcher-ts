//
// Copyright 2021 Vulcanize, Inc.
//

import 'mocha';
import { expect } from 'chai';
import { GraphQLClient } from 'graphql-request';

import { queryBundles } from '../queries';
import { Data } from './data';

describe('server', () => {
  const client = new GraphQLClient('http://localhost:3004/graphql');
  const data = Data.getInstance();

  it('query bundle', async () => {
    const { bundles } = data.entities;
    expect(bundles.length).to.be.greaterThan(0);

    for (let i = 0; i < bundles.length; i++) {
      const { id, blockNumber, ethPriceUSD } = bundles[i];

      // Bundle query.
      const [bundle] = await client.request(queryBundles, { first: 1, block: { number: blockNumber } });
      expect(bundle.id).to.equal(id);
      expect(bundle.ethPriceUSD).to.equal(ethPriceUSD);
    }
  });
});
