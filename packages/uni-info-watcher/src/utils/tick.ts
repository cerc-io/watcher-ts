import Decimal from 'decimal.js';

import { Pool } from '../entity/Pool';
import { Database } from '../database';
import { bigDecimalExponated, safeDiv } from '.';
import { Tick } from '../entity/Tick';

export const loadTick = async (db: Database, tickId: string, tickIdx: bigint, pool: Pool, blockNumber: number): Promise<Tick> => {
  // 1.0001^tick is token1/token0.
  const price0 = bigDecimalExponated(new Decimal('1.0001'), tickIdx);

  return db.loadTick({
    id: tickId,
    blockNumber,
    tickIdx: tickIdx,
    pool,
    poolAddress: pool.id,
    price0,
    price1: safeDiv(new Decimal(1), price0)
  });
};
