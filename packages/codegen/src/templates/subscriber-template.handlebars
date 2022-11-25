//
// Copyright 2022 Vulcanize, Inc.
//

import { EventSubscriber, EntitySubscriberInterface, InsertEvent, UpdateEvent } from 'typeorm';

import { afterEntityInsertOrUpdate } from '@cerc-io/util';

import { FrothyEntity } from './FrothyEntity';
import { ENTITY_TO_LATEST_ENTITY_MAP, SUBGRAPH_ENTITIES } from '../database';

@EventSubscriber()
export class EntitySubscriber implements EntitySubscriberInterface {
  async afterInsert (event: InsertEvent<any>): Promise<void> {
    await afterEntityInsertOrUpdate(FrothyEntity, SUBGRAPH_ENTITIES, event, ENTITY_TO_LATEST_ENTITY_MAP);
  }

  async afterUpdate (event: UpdateEvent<any>): Promise<void> {
    await afterEntityInsertOrUpdate(FrothyEntity, SUBGRAPH_ENTITIES, event, ENTITY_TO_LATEST_ENTITY_MAP);
  }
}
