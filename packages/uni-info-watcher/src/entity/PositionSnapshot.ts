//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, ManyToOne } from 'typeorm';
import { graphDecimalTransformer, GraphDecimal, bigintTransformer } from '@vulcanize/util';

import { Pool } from './Pool';
import { Transaction } from './Transaction';
import { ADDRESS_ZERO } from '../utils/constants';
import { Position } from './Position';

@Entity()
export class PositionSnapshot {
  @PrimaryColumn('varchar')
  id!: string;

  // https://typeorm.io/#/entities/primary-columns
  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string

  @Column('integer')
  blockNumber!: number;

  @Column('numeric', { transformer: bigintTransformer })
  timestamp!: bigint;

  @Column('numeric', { transformer: bigintTransformer })
  feeGrowthInside0LastX128!: bigint

  @Column('numeric', { transformer: bigintTransformer })
  feeGrowthInside1LastX128!: bigint

  @Column('numeric', { default: BigInt(0), transformer: bigintTransformer })
  liquidity!: bigint

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  depositedToken0!: GraphDecimal

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  depositedToken1!: GraphDecimal

  @Column('varchar', { length: 42, default: ADDRESS_ZERO })
  owner!: string

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  withdrawnToken0!: GraphDecimal

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  withdrawnToken1!: GraphDecimal

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  collectedFeesToken0!: GraphDecimal

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  collectedFeesToken1!: GraphDecimal

  @ManyToOne(() => Pool, { onDelete: 'CASCADE' })
  pool!: Pool

  @ManyToOne(() => Position, { onDelete: 'CASCADE' })
  position!: Position

  @ManyToOne(() => Transaction, { onDelete: 'CASCADE' })
  transaction!: Transaction
}
