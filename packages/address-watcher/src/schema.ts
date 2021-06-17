import { gql } from '@apollo/client/core';

export default gql`
# Types

# Watched event, include additional context over and above the event data.
type WatchedEvent {
  blockHash: String!
  txHash: String!
  address: String!
}

#
# Queries
#

type Query {

  queryAppearances(
    address: String!
    txHash: String!
  ): [String!]
}

#
# Subscriptions
#
type Subscription {

  # Watch for token events (at head of chain).
  onAddressEvent: WatchedEvent!
}

#
# Mutations
#
type Mutation {

  # Actively watch and index data for the address.
  watchAddress(
    address: String!
    startingBlock: Int
  ): Boolean!
}
`;
