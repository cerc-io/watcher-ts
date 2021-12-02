//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, ManyToOne } from 'typeorm';
import { graphDecimalTransformer, GraphDecimal, bigintTransformer } from '@vulcanize/util';

import { Pool } from './Pool';

@Entity()
export class Tick {
  @PrimaryColumn('varchar')
  id!: string;

  // https://typeorm.io/#/entities/primary-columns
  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string

  @Column('integer')
  blockNumber!: number;

  @Column('numeric', { transformer: bigintTransformer })
  tickIdx!: bigint;

  @ManyToOne(() => Pool, { onDelete: 'CASCADE' })
  pool!: Pool

  @Column('varchar', { length: 42 })
  poolAddress!: string

  @Column('numeric', { transformer: graphDecimalTransformer })
  price0!: GraphDecimal

  @Column('numeric', { transformer: graphDecimalTransformer })
  price1!: GraphDecimal

  @Column('numeric', { default: 0, transformer: bigintTransformer })
  liquidityGross!: bigint

  @Column('numeric', { default: 0, transformer: bigintTransformer })
  liquidityNet!: bigint
}
