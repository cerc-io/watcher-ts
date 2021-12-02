//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, ManyToMany, JoinTable } from 'typeorm';
import { graphDecimalTransformer, GraphDecimal, bigintTransformer } from '@vulcanize/util';

import { Pool } from './Pool';

@Entity()
export class Token {
  @PrimaryColumn('varchar', { length: 42 })
  id!: string;

  // https://typeorm.io/#/entities/primary-columns
  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string

  @Column('integer')
  blockNumber!: number;

  @Column('varchar')
  symbol!: string;

  @Column('varchar')
  name!: string;

  @Column('numeric', { transformer: bigintTransformer })
  totalSupply!: bigint;

  @Column('numeric', { transformer: bigintTransformer })
  decimals!: bigint;

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  derivedETH!: GraphDecimal;

  @Column('numeric', { default: BigInt(0), transformer: bigintTransformer })
  txCount!: bigint;

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  totalValueLocked!: GraphDecimal;

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  totalValueLockedUSD!: GraphDecimal;

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  volume!: GraphDecimal;

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  volumeUSD!: GraphDecimal;

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  untrackedVolumeUSD!: GraphDecimal;

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  feesUSD!: GraphDecimal;

  @ManyToMany(() => Pool)
  @JoinTable()
  whitelistPools!: Pool[];

  // TODO: Add remaining fields when they are used.
}
