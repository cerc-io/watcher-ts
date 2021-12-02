//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, ManyToOne } from 'typeorm';
import { graphDecimalTransformer, GraphDecimal, bigintTransformer } from '@vulcanize/util';

import { Transaction } from './Transaction';
import { Pool } from './Pool';
import { Token } from './Token';

@Entity()
export class Swap {
  @PrimaryColumn('varchar')
  id!: string;

  // https://typeorm.io/#/entities/primary-columns
  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string

  @Column('integer')
  blockNumber!: number;

  @ManyToOne(() => Transaction, transaction => transaction.swaps, { onDelete: 'CASCADE' })
  transaction!: Transaction

  @Column('numeric', { transformer: bigintTransformer })
  timestamp!: bigint;

  @ManyToOne(() => Pool, { onDelete: 'CASCADE' })
  pool!: Pool

  @ManyToOne(() => Token, { onDelete: 'CASCADE' })
  token0!: Token

  @ManyToOne(() => Token, { onDelete: 'CASCADE' })
  token1!: Token

  @Column('varchar', { length: 42 })
  sender!: string

  @Column('varchar', { length: 42 })
  origin!: string

  @Column('varchar', { length: 42 })
  recipient!: string

  @Column('numeric', { transformer: graphDecimalTransformer })
  amount0!: GraphDecimal

  @Column('numeric', { transformer: graphDecimalTransformer })
  amount1!: GraphDecimal

  @Column('numeric', { transformer: graphDecimalTransformer })
  amountUSD!: GraphDecimal

  @Column('numeric', { transformer: bigintTransformer })
  tick!: bigint

  @Column('numeric', { transformer: bigintTransformer })
  sqrtPriceX96!: bigint
}
