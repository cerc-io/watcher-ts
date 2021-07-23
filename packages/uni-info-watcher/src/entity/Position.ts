import { Entity, PrimaryColumn, Column, ManyToOne } from 'typeorm';
import Decimal from 'decimal.js';
import { decimalTransformer } from '@vulcanize/util';

import { Pool } from './Pool';
import { Token } from './Token';
import { Tick } from './Tick';
import { Transaction } from './Transaction';
import { ADDRESS_ZERO } from '../utils/constants';

@Entity()
export class Position {
  @PrimaryColumn('varchar')
  id!: string;

  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string

  @Column('integer')
  blockNumber!: number;

  @Column('bigint')
  feeGrowthInside0LastX128!: bigint

  @Column('bigint')
  feeGrowthInside1LastX128!: bigint

  @Column('bigint', { default: BigInt(0) })
  liquidity!: bigint

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  depositedToken0!: Decimal

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  depositedToken1!: Decimal

  @Column('varchar', { length: 42, default: ADDRESS_ZERO })
  owner!: string

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  withdrawnToken0!: Decimal

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  withdrawnToken1!: Decimal

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  collectedFeesToken0!: Decimal

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  collectedFeesToken1!: Decimal

  @ManyToOne(() => Pool)
  pool!: Pool

  @ManyToOne(() => Token)
  token0!: Token

  @ManyToOne(() => Token)
  token1!: Token

  @ManyToOne(() => Tick)
  tickLower!: Tick

  @ManyToOne(() => Tick)
  tickUpper!: Tick

  @ManyToOne(() => Transaction)
  transaction!: Transaction
}
