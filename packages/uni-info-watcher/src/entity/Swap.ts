import { Entity, PrimaryColumn, Column, ManyToOne } from 'typeorm';
import Decimal from 'decimal.js';
import { decimalTransformer } from '@vulcanize/util';

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

  @ManyToOne(() => Transaction, transaction => transaction.swaps)
  transaction!: Transaction

  @Column('bigint')
  timestamp!: BigInt;

  @ManyToOne(() => Pool)
  pool!: Pool

  @ManyToOne(() => Token)
  token0!: Token

  @ManyToOne(() => Token)
  token1!: Token

  @Column('varchar', { length: 42 })
  sender!: string

  @Column('varchar', { length: 42 })
  origin!: string

  @Column('varchar', { length: 42 })
  recipient!: string

  @Column('numeric', { transformer: decimalTransformer })
  amount0!: Decimal

  @Column('numeric', { transformer: decimalTransformer })
  amount1!: Decimal

  @Column('numeric', { transformer: decimalTransformer })
  amountUSD!: Decimal

  @Column('bigint')
  tick!: bigint

  @Column('bigint')
  sqrtPriceX96!: bigint
}
