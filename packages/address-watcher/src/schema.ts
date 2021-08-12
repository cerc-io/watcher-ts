//
// Copyright 2021 Vulcanize, Inc.
//

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

type BlockProgressEvent {
  blockNumber: Int!
  blockHash: String!
  numTx: Int!
  numTracedTx: Int!
  isComplete: Boolean!
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

  # Watch for block progress events from filler process.
  onBlockProgressEvent: BlockProgressEvent!
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
