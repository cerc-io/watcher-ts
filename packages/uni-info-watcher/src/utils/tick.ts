//
// Copyright 2021 Vulcanize, Inc.
//

import { QueryRunner } from 'typeorm';

import { GraphDecimal } from '@vulcanize/util';

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
  const price0 = bigDecimalExponated(new GraphDecimal('1.0001'), tickIdx);

  tick.price0 = price0;
  tick.price1 = safeDiv(new GraphDecimal(1), price0);

  return db.saveTick(dbTx, tick, block);
};

export const feeTierToTickSpacing = (feeTier: bigint): bigint => {
  if (feeTier === BigInt(10000)) {
    return BigInt(200);
  }
  if (feeTier === BigInt(3000)) {
    return BigInt(60);
  }
  if (feeTier === BigInt(500)) {
    return BigInt(10);
  }
  if (feeTier === BigInt(100)) {
    return BigInt(1);
  }

  throw Error('Unexpected fee tier');
};
