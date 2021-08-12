//
// Copyright 2021 Vulcanize, Inc.
//

import { gql } from 'graphql-request';

export const queryBundle = gql`
query getBundle($id: ID!, $blockNumber: Int!) {
  bundle(id: $id, block: { number: $blockNumber }) {
    id
    ethPriceUSD
  }
}
`;
