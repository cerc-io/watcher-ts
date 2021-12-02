//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, ManyToOne } from 'typeorm';
import { bigintTransformer, graphDecimalTransformer, GraphDecimal } from '@vulcanize/util';

import { Transaction } from './Transaction';
import { Pool } from './Pool';
import { Token } from './Token';

@Entity()
export class Burn {
  @PrimaryColumn('varchar')
  id!: string;

  // https://typeorm.io/#/entities/primary-columns
  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string

  @Column('integer')
  blockNumber!: number;

  @ManyToOne(() => Transaction, transaction => transaction.burns, { onDelete: 'CASCADE' })
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
  owner!: string

  @Column('varchar', { length: 42 })
  origin!: string

  @Column('numeric', { transformer: bigintTransformer })
  amount!: bigint

  @Column('numeric', { transformer: graphDecimalTransformer })
  amount0!: GraphDecimal

  @Column('numeric', { transformer: graphDecimalTransformer })
  amount1!: GraphDecimal

  @Column('numeric', { transformer: graphDecimalTransformer })
  amountUSD!: GraphDecimal

  @Column('numeric', { transformer: bigintTransformer })
  tickLower!: bigint

  @Column('numeric', { transformer: bigintTransformer })
  tickUpper!: bigint
}
