import { PoolCreated } from '../../generated/Factory/Factory';
import { Pool as PoolTemplate } from '../../generated/templates';
import { DataSourceContext, log } from '@graphprotocol/graph-ts';

export function handlePoolCreated (event: PoolCreated): void {
  log.debug('PoolCreated event', []);

  if (event.params.fee > 500) {
    const context = new DataSourceContext();
    context.setI32('fee', event.params.fee);
    PoolTemplate.createWithContext(event.params.pool, context);
  }

  // create the tracked contract based on the template
  PoolTemplate.create(event.params.pool);
}
