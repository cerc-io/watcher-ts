# Design Notes

## Watchers

* uniswap-watcher
  * Provides events to downstream subscribers, access to core/periphery contract data,
* uniswap-info-watcher
  * Subscribes to uniswap-watcher
  * Performs computation/derivation of entity properties required by info frontend
  * Filler (old to new block)

## Issues

* Filler should process block by block (old to new) starting from contract deployment block
  * Otherwise, values of computed props will be incorrect
  * "last_processed_block_number"
* Use audit/proof table to record changes to entities instead of aggregating in code (too slow)
* Handling reorgs
* ERC20 variants (storage layout)
