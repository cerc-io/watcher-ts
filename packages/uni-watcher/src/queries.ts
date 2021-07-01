import { gql } from 'graphql-request';

export const queryEvents = gql`
query getEvents($blockHash: String!, $token: String!) {
  events(blockHash: $blockHash, token: $token) {
    event {
      __typename
    }
    proof {
      data
    }
  }
}
`;
