import Decimal from 'decimal.js';
import { Entity, PrimaryColumn, Column, ManyToOne } from 'typeorm';
import { decimalTransformer } from '@vulcanize/util';

import { Token } from './Token';

@Entity()
export class Pool {
  @PrimaryColumn('varchar', { length: 42 })
  id!: string;

  // https://typeorm.io/#/entities/primary-columns
  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string

  @Column('integer')
  blockNumber!: number;

  @ManyToOne(() => Token)
  token0!: Token;

  @ManyToOne(() => Token)
  token1!: Token;

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  token0Price!: Decimal

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  token1Price!: Decimal

  @Column('numeric')
  feeTier!: bigint

  @Column('numeric', { default: BigInt(0) })
  sqrtPrice!: bigint

  @Column('bigint', { nullable: true })
  tick!: bigint | null

  @Column('numeric', { default: BigInt(0) })
  liquidity!: bigint

  @Column('numeric', { default: BigInt(0) })
  feeGrowthGlobal0X128!: bigint

  @Column('numeric', { default: BigInt(0) })
  feeGrowthGlobal1X128!: bigint

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  totalValueLockedUSD!: Decimal

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  totalValueLockedToken0!: Decimal

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  totalValueLockedToken1!: Decimal

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  totalValueLockedETH!: Decimal

  @Column('bigint', { default: BigInt(0) })
  txCount!: bigint;

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  volumeToken0!: Decimal

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  volumeToken1!: Decimal

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  volumeUSD!: Decimal

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  untrackedVolumeUSD!: Decimal

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  feesUSD!: Decimal

  // TODO: Add remaining fields when they are used.
}
