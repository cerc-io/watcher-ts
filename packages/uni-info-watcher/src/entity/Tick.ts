import { Entity, PrimaryColumn, Column, ManyToOne } from 'typeorm';
import Decimal from 'decimal.js';
import { decimalTransformer } from '@vulcanize/util';

import { Pool } from './Pool';

@Entity()
export class Tick {
  @PrimaryColumn('varchar')
  id!: string;

  @PrimaryColumn('integer')
  blockNumber!: number;

  @Column('bigint')
  tickIdx!: BigInt;

  @ManyToOne(() => Pool)
  pool!: Pool

  @Column('varchar', { length: 42 })
  poolAddress!: string

  @Column('numeric', { transformer: decimalTransformer })
  price0!: Decimal

  @Column('numeric', { transformer: decimalTransformer })
  price1!: Decimal

  @Column('bigint', { default: 0 })
  liquidityGross!: bigint

  @Column('bigint', { default: 0 })
  liquidityNet!: bigint
}
