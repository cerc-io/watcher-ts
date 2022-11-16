//
// Copyright 2022 Vulcanize, Inc.
//

import { EventSubscriber, EntitySubscriberInterface, InsertEvent, UpdateEvent } from 'typeorm';

import { afterEntityInsertOrUpdate } from '@cerc-io/graph-node';

import { FrothyEntity } from './FrothyEntity';
import { ENTITIES, ENTITY_TO_LATEST_ENTITY_MAP } from '../database';

@EventSubscriber()
export class EntitySubscriber implements EntitySubscriberInterface {
  async afterInsert (event: InsertEvent<any>): Promise<void> {
    await afterEntityInsertOrUpdate(FrothyEntity, ENTITIES, event, ENTITY_TO_LATEST_ENTITY_MAP);
  }

  async afterUpdate (event: UpdateEvent<any>): Promise<void> {
    await afterEntityInsertOrUpdate(FrothyEntity, ENTITIES, event, ENTITY_TO_LATEST_ENTITY_MAP);
  }
}
