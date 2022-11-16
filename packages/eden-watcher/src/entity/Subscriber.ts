//
// Copyright 2022 Vulcanize, Inc.
//

import { EventSubscriber, EntitySubscriberInterface, InsertEvent, UpdateEvent } from 'typeorm';

import { afterEntityInsertOrUpdate } from '@cerc-io/graph-node';

import { FrothyEntity } from './FrothyEntity';
import { ENTITIES } from '../database';

@EventSubscriber()
export class EntitySubscriber implements EntitySubscriberInterface {
  async afterInsert (event: InsertEvent<any>): Promise<void> {
    await afterEntityInsertOrUpdate(FrothyEntity, ENTITIES, event);
  }

  async afterUpdate (event: UpdateEvent<any>): Promise<void> {
    await afterEntityInsertOrUpdate(FrothyEntity, ENTITIES, event);
  }
}
