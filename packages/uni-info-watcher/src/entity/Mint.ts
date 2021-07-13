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

  @PrimaryColumn('integer')
  blockNumber!: number;

  @ManyToOne(() => Transaction, transaction => transaction.mints)
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
  owner!: string

  @Column('varchar', { length: 42 })
  sender!: string

  // TODO: Assign origin with Transaction from address.
  // @Column('varchar', { length: 42 })
  // origin!: string

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
