import { dataSource, ethereum, log } from '@graphprotocol/graph-ts';

import { Initialize } from '../../generated/templates/Pool/Pool';

export function handleInitialize (event: Initialize): void {
  log.debug('event.address: {}', [event.address.toHexString()]);
  log.debug('event.params.sqrtPriceX96: {}', [event.params.sqrtPriceX96.toString()]);
  log.debug('event.params.tick: {}', [event.params.tick.toString()]);
}

export function handleBlock (block: ethereum.Block): void {
  log.debug('block info: {}', [block.number.toString()]);
  log.debug('dataSource address: {}', [dataSource.address().toHex()]);
}
