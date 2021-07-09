import { gql } from '@apollo/client/core';

export default gql`
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

# ERC20 Events

# event Transfer(address indexed from, address indexed to, uint256 value);
type TransferEvent {
  from: String!
  to: String!
  value: BigInt!
}

union ERC20Event = TransferEvent

# Factory Types

type ResultGetPool {
  pool: String

  proof: Proof
}

# Factory Events

# event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool);
type PoolCreatedEvent {
  token0: String!
  token1: String!
  fee: BigInt!
  tickSpacing: BigInt!
  pool: String!
}

# All events emitted by the UniswapV3Factory contract.
union FactoryEvent = PoolCreatedEvent

# NonfungiblePositionManager Types

type ResultPosition {
  nonce: BigInt!
  operator: String!
  poolId: BigInt!
  tickLower: BigInt!
  tickUpper: BigInt!
  liquidity: BigInt!
  feeGrowthInside0LastX128: BigInt!
  feeGrowthInside1LastX128: BigInt!
  tokensOwed0: BigInt!
  tokensOwed1: BigInt!

  proof: Proof
}

type ResultPoolKey {
  token0: String!
  token1: String!
  fee: BigInt!

  proof: Proof
}

# NonfungiblePositionManager Events

# event IncreaseLiquidity(uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);
type IncreaseLiquidityEvent {
  tokenId: BigInt!
  liquidity: BigInt!
  amount0: BigInt!
  amount1: BigInt!
}

# event DecreaseLiquidity(uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);
type DecreaseLiquidityEvent {
  tokenId: BigInt!
  liquidity: BigInt!
  amount0: BigInt!
  amount1: BigInt!
}

# event Collect(uint256 indexed tokenId, address recipient, uint256 amount0, uint256 amount1);
type CollectEvent {
  tokenId: BigInt!
  recipient: String!
  amount0: BigInt!
  amount1: BigInt!
}

# All events emitted by the NonfungiblePositionManager contract.
union NonFungiblePositionManagerEvent = IncreaseLiquidityEvent | DecreaseLiquidityEvent | CollectEvent


# Pool Events

# event Initialize(uint160 sqrtPriceX96, int24 tick);
type InitializeEvent {
  sqrtPriceX96: BigInt!
  tick: BigInt!
}

# event Mint(address sender, address indexed owner, int24 indexed tickLower, int24 indexed tickUpper, uint128 amount, uint256 amount0, uint256 amount1);
type MintEvent {
  sender: String!
  owner: String!
  tickLower: BigInt!
  tickUpper: BigInt!
  amount: BigInt!
  amount0: BigInt!
  amount1: BigInt!
}

# event Burn(address indexed owner, int24 indexed tickLower, int24 indexed tickUpper, uint128 amount, uint256 amount0, uint256 amount1);
type BurnEvent {
  owner: String!
  tickLower: BigInt!
  tickUpper: BigInt!
  amount: BigInt!
  amount0: BigInt!
  amount1: BigInt!
}

# event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick);
type SwapEvent {
  sender: String!
  recipient: String!
  amount0: BigInt!
  amount1: BigInt!
  sqrtPriceX96: BigInt!
  liquidity: BigInt!
  tick: BigInt!
}

union PoolEvent = InitializeEvent | MintEvent | BurnEvent | SwapEvent


# All events emitted by the watcher.
union Event = TransferEvent | PoolCreatedEvent | IncreaseLiquidityEvent | DecreaseLiquidityEvent | CollectEvent | InitializeEvent | MintEvent | BurnEvent | SwapEvent

# Result type, with proof, for event return values.
type ResultEvent {
  event: Event!

  # Proof from receipts trie.
  proof: Proof
}

# Watched event, include additional context over and above the event data.
type WatchedEvent {
  blockHash: String!
  blockNumber: Int!
  contract: String!
  txHash: String!

  event: ResultEvent!
}

#
# Queries
#

type Query {

  # NonfungiblePositionManager

  position(
    blockHash: String!
    tokenId: BigInt!
  ): ResultPosition

  poolIdToPoolKey(
    blockHash: String!
    poolId: BigInt!
  ): ResultPoolKey

  # Factory

  getPool(
    blockHash: String!
    token0: String!
    token1: String!
    fee: BigInt!
  ): ResultGetPool

  # Pool

  feeGrowthGlobal0X128(
    blockHash: String!
  ): ResultUInt256!

  # Pool (feeGrowthGlobal1X128)
  feeGrowthGlobal1X128(
    blockHash: String!
  ): ResultUInt256!

  # Get uniswap events at a certain block, optionally filter by event name.
  events(
    blockHash: String!
    contract: String!
    name: String
  ): [ResultEvent!]
}

#
# Subscriptions
#
type Subscription {

  # Watch for events (at head of chain).
  onEvent: WatchedEvent!
}
`;
