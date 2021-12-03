//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, ManyToOne } from 'typeorm';
import { bigintTransformer } from '@vulcanize/util';

import { Pool } from './Pool';
import { Tick } from './Tick';

@Entity()
export class TickDayData {
  @PrimaryColumn('varchar')
  id!: string;

  // https://typeorm.io/#/entities/primary-columns
  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string

  @Column('integer')
  blockNumber!: number;

  @Column('integer')
  date!: number

  @ManyToOne(() => Pool, { onDelete: 'CASCADE' })
  pool!: Pool;

  @ManyToOne(() => Tick, { onDelete: 'CASCADE' })
  tick!: Tick

  @Column('numeric', { transformer: bigintTransformer })
  liquidityGross!: bigint;

  @Column('numeric', { transformer: bigintTransformer })
  liquidityNet!: bigint;
}
