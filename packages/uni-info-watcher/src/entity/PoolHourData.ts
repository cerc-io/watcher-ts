//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, ManyToOne } from 'typeorm';
import { graphDecimalTransformer, GraphDecimal, bigintTransformer } from '@vulcanize/util';

import { Pool } from './Pool';

@Entity()
export class PoolHourData {
  @PrimaryColumn('varchar')
  id!: string;

  // https://typeorm.io/#/entities/primary-columns
  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string

  @Column('integer')
  blockNumber!: number;

  @Column('integer')
  periodStartUnix!: number;

  @ManyToOne(() => Pool, { onDelete: 'CASCADE' })
  pool!: Pool;

  @Column('numeric', { transformer: graphDecimalTransformer })
  high!: GraphDecimal;

  @Column('numeric', { transformer: graphDecimalTransformer })
  low!: GraphDecimal;

  @Column('numeric', { transformer: graphDecimalTransformer })
  open!: GraphDecimal;

  @Column('numeric', { transformer: graphDecimalTransformer })
  close!: GraphDecimal;

  @Column('numeric', { default: BigInt(0), transformer: bigintTransformer })
  sqrtPrice!: bigint

  @Column('numeric', { nullable: true, transformer: bigintTransformer })
  tick!: bigint | null

  @Column('numeric', { default: BigInt(0), transformer: bigintTransformer })
  liquidity!: bigint

  @Column('numeric', { default: BigInt(0), transformer: bigintTransformer })
  feeGrowthGlobal0X128!: bigint

  @Column('numeric', { default: BigInt(0), transformer: bigintTransformer })
  feeGrowthGlobal1X128!: bigint

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  token0Price!: GraphDecimal

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  token1Price!: GraphDecimal

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  tvlUSD!: GraphDecimal

  @Column('numeric', { default: BigInt(0), transformer: bigintTransformer })
  txCount!: bigint

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  volumeToken0!: GraphDecimal

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  volumeToken1!: GraphDecimal

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  volumeUSD!: GraphDecimal

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  feesUSD!: GraphDecimal

  // TODO: Add remaining fields when they are used.
}
