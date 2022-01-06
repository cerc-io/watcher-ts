import { PoolCreated } from '../../generated/Factory/Factory';
import { Pool as PoolTemplate } from '../../generated/templates';
import { log } from '@graphprotocol/graph-ts';

export function handlePoolCreated (event: PoolCreated): void {
  log.debug('PoolCreated event', []);

  // create the tracked contract based on the template
  PoolTemplate.create(event.params.pool);
}
