//
// Copyright 2021 Vulcanize, Inc.
//

export const MAX_REORG_DEPTH = 16;
export const DIFF_MERGE_BATCH_SIZE = 10000;

export const QUEUE_BLOCK_PROCESSING = 'block-processing';
export const QUEUE_HISTORICAL_PROCESSING = 'historical-processing';
export const QUEUE_EVENT_PROCESSING = 'event-processing';
export const QUEUE_CHAIN_PRUNING = 'chain-pruning';
export const QUEUE_BLOCK_CHECKPOINT = 'block-checkpoint';
export const QUEUE_HOOKS = 'hooks';

export const JOB_KIND_INDEX = 'index';
export const JOB_KIND_PRUNE = 'prune';

export const JOB_KIND_EVENTS = 'events';
export const JOB_KIND_CONTRACT = 'contract';

export const DEFAULT_CONFIG_PATH = 'environments/local.toml';

export const UNKNOWN_EVENT_NAME = '__unknown__';

export const KIND_ACTIVE = 'active';
export const KIND_LAZY = 'lazy';

export const DEFAULT_PREFETCH_BATCH_SIZE = 10;

export const DEFAULT_MAX_GQL_CACHE_SIZE = Math.pow(2, 20) * 8; // 8 MB

export const SUPPORTED_PAID_RPC_METHODS = ['eth_getBlockByHash', 'eth_getStorageAt', 'eth_getBlockByNumber'];

export const NULL_BLOCK_ERROR = 'requested epoch was a null round';
