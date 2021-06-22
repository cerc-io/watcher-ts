import { gql } from '@apollo/client/core';

export default gql`
# Types

type TxTrace {
  txHash: String!
  blockNumber: Int!
  blockHash: String!
  trace: String!
}

# Watched address event, include additional context over and above the event data.
type WatchedAddressEvent {
  address: String!
  txTrace: TxTrace!
}

#
# Queries
#

type Query {

  #
  # Developer API methods
  #

  appearances(
    address: String!
    fromBlockNumber: Int!
    toBlockNumber: Int!
  ): [TxTrace!]

  #
  # Low level utility methods
  #

  traceTx(
    txHash: String!
  ): TxTrace
}

#
# Subscriptions
#
type Subscription {

  # Watch for address events (at head of chain).
  onAddressEvent(address: String!): WatchedAddressEvent!
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
