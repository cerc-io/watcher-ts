import { gql } from '@apollo/client/core';

export default gql`
# Types

# Support uint256 values.
scalar BigInt

# Ethereum types

type Block {
  hash: String!
  number: Int!
  timestamp: Int!
  parentHash: String!
}

type Transaction {
  hash: String!
  index: Int!
  from: String!
  to: String!
}

# event StorageRequest(address uploader, string cid, string config, uint fileCost);
type StorageRequestEvent {
  uploader: String!
  cid: String!
  config: String!
  fileCost: BigInt!
}

# All events emitted by the watcher.
union Event = StorageRequestEvent

# Proof for returned data. Serialized blob for now.
# Will be converted into a well defined structure later.
type Proof {
  data: String!
}

# Result event, include additional context over and above the event data.
type ResultEvent {
  # Block and tx data for the event.
  block: Block!
  tx: Transaction!

  # Contract that generated the event.
  contract: String!

  # Index of the event in the block.
  eventIndex: Int!

  event: Event!

  # Proof from receipts trie.
  proof: Proof
}

#
# Queries
#
type Query {
  # https://github.com/ardatan/graphql-tools/issues/764#issuecomment-419556241
  dummy: String
}

#
# Subscriptions
#
type Subscription {
  # Watch for Lighthouse events (at head of chain).
  onEvent: ResultEvent!
}
`;
