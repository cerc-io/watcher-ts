import { dataSource, ethereum, log } from '@graphprotocol/graph-ts';

import { Initialize } from '../../generated/templates/Pool/Pool';

export function handleInitialize (event: Initialize): void {
  log.debug('event.address: {}', [event.address.toHexString()]);
  log.debug('event.params.sqrtPriceX96: {}', [event.params.sqrtPriceX96.toString()]);
  log.debug('event.params.tick: {}', [event.params.tick.toString()]);

  const context = dataSource.context();

  if (context.isSet('fee')) {
    const fee = context.getI32('fee');
    log.debug('datasource context fee in eventHandler: {}', [fee.toString()]);
  }
}

export function handleBlock (block: ethereum.Block): void {
  log.debug('block info: {}', [block.number.toString()]);
  log.debug('dataSource address: {}', [dataSource.address().toHex()]);

  const context = dataSource.context();

  if (context.isSet('fee')) {
    const fee = context.getI32('fee');
    log.debug('datasource context fee in blockHandler: {}', [fee.toString()]);
  }
}
