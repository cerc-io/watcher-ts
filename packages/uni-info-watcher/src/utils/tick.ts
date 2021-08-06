import Decimal from 'decimal.js';
import { QueryRunner } from 'typeorm';

import { Pool } from '../entity/Pool';
import { Database } from '../database';
import { bigDecimalExponated, safeDiv } from '.';
import { Tick } from '../entity/Tick';
import { Block } from '../events';

export const createTick = async (db: Database, dbTx: QueryRunner, tickId: string, tickIdx: bigint, pool: Pool, block: Block): Promise<Tick> => {
  const tick = new Tick();
  tick.id = tickId;
  tick.tickIdx = tickIdx;
  tick.pool = pool;
  tick.poolAddress = pool.id;

  // 1.0001^tick is token1/token0.
  const price0 = bigDecimalExponated(new Decimal('1.0001'), tickIdx);

  tick.price0 = price0;
  tick.price1 = safeDiv(new Decimal(1), price0);

  return db.saveTick(dbTx, tick, block);
};
