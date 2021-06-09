import { gql } from '@apollo/client/core';

export default gql`
#
# ERC20 GQL schema
#
# See: https://eips.ethereum.org/EIPS/eip-20
# ABI: https://ethereumdev.io/abi-for-erc20-contract-on-ethereum/
#

# Types

# Support uint256 values.
scalar BigInt

# Proof for returned data. Serialized blob for now.
# Will be converted into a well defined structure later.
type Proof {
  data: String!
}

# Result type, with proof, for string method return values.
type ResultString {
  value: String

  # Proof from state/storage trie.
  proof: Proof
}

# Result type, with proof, for uint256 method return values.
type ResultUInt256 {
  value: BigInt!

  # Proof from state/storage trie.
  proof: Proof
}

# Transfer Event
type TransferEvent {
  from: String!
  to: String!
  value: BigInt!
}

# Approval Event
type ApprovalEvent {
  owner: String!
  spender: String!
  value: BigInt!
}

# All possible event types fired by an ERC20 contract.
union TokenEvent = TransferEvent | ApprovalEvent

# Result type, with proof, for event return values.
type ResultEvent {
  event: TokenEvent!

  # Proof from receipts trie.
  proof: Proof
}

# Watched event, include additional context over and above the event data.
type WatchedEvent {
  blockHash: String!
  token: String!

  event: ResultEvent!
}

#
# Queries
#

type Query {

  #
  # Interface of the ERC20 standard as defined in the EIP.
  # https://docs.openzeppelin.com/contracts/2.x/api/token/erc20#IERC20
  #

  totalSupply(
    blockHash: String!
    token: String!
  ): ResultUInt256!

  balanceOf(
    blockHash: String!
    token: String!

    owner: String!
  ): ResultUInt256!

  allowance(
    blockHash: String!
    token: String!

    owner: String!
    spender: String!
  ): ResultUInt256!

  #
  # Optional functions from the ERC20 standard.
  # https://docs.openzeppelin.com/contracts/2.x/api/token/erc20#ERC20Detailed
  #

  name(
    blockHash: String!
    token: String!
  ): ResultString!

  symbol(
    blockHash: String!
    token: String!
  ): ResultString!

  decimals(
    blockHash: String!
    token: String!
  ): ResultUInt256!

  #
  # Additional watcher queries.
  #

  # Get token events at a certain block, optionally filter by event name.
  events(
    blockHash: String!
    token: String!
    name: String
  ): [ResultEvent!]
}

#
# Subscriptions
#
type Subscription {

  # Watch for token events (at head of chain).
  onTokenEvent: WatchedEvent!
}

#
# Mutations
#
type Mutation {

  # Actively watch and index data for the token.
  watchToken(
    token: String!
    startingBlock: Int
  ): Boolean!
}
`;
