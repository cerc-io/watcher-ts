//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, ManyToOne } from 'typeorm';
import Decimal from 'decimal.js';
import { decimalTransformer } from '@vulcanize/util';

import { Transaction } from './Transaction';
import { Pool } from './Pool';
import { Token } from './Token';

@Entity()
export class Mint {
  @PrimaryColumn('varchar')
  id!: string;

  // https://typeorm.io/#/entities/primary-columns
  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string

  @Column('integer')
  blockNumber!: number;

  @ManyToOne(() => Transaction, transaction => transaction.mints, { onDelete: 'CASCADE' })
  transaction!: Transaction

  @Column('bigint')
  timestamp!: BigInt;

  @ManyToOne(() => Pool, { onDelete: 'CASCADE' })
  pool!: Pool

  @ManyToOne(() => Token, { onDelete: 'CASCADE' })
  token0!: Token

  @ManyToOne(() => Token, { onDelete: 'CASCADE' })
  token1!: Token

  @Column('varchar', { length: 42 })
  owner!: string

  @Column('varchar', { length: 42 })
  sender!: string

  @Column('varchar', { length: 42 })
  origin!: string

  @Column('bigint')
  amount!: bigint

  @Column('numeric', { transformer: decimalTransformer })
  amount0!: Decimal

  @Column('numeric', { transformer: decimalTransformer })
  amount1!: Decimal

  @Column('numeric', { transformer: decimalTransformer })
  amountUSD!: Decimal

  @Column('bigint')
  tickLower!: bigint

  @Column('bigint')
  tickUpper!: bigint
}
