import { Entity, PrimaryColumn, Column, ManyToOne } from 'typeorm';
import { Pool } from './Pool';

@Entity()
export class PoolDayData {
  @PrimaryColumn('varchar')
  id!: string;

  @PrimaryColumn('integer')
  blockNumber!: number;

  @Column('integer')
  date!: number;

  @ManyToOne(() => Pool)
  pool!: Pool;

  @Column('numeric')
  high!: number;

  @Column('numeric')
  low!: number;

  @Column('numeric')
  open!: number;

  @Column('numeric')
  close!: number;

  @Column('numeric', { default: BigInt(0) })
  sqrtPrice!: bigint

  @Column('numeric', { default: BigInt(0) })
  tick!: bigint

  @Column('numeric', { default: BigInt(0) })
  liquidity!: bigint

  @Column('numeric', { default: BigInt(0) })
  feeGrowthGlobal0X128!: bigint

  @Column('numeric', { default: BigInt(0) })
  feeGrowthGlobal1X128!: bigint

  @Column('numeric', { default: 0 })
  token0Price!: number

  @Column('numeric', { default: 0 })
  token1Price!: number

  @Column('numeric', { default: 0 })
  tvlUSD!: number

  @Column('numeric', { default: BigInt(0) })
  txCount!: bigint

  // TODO: Add remaining fields when they are used.
}
