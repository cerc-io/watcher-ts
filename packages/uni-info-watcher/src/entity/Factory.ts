//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, Column, PrimaryColumn } from 'typeorm';
import { graphDecimalTransformer, GraphDecimal, bigintTransformer } from '@vulcanize/util';

@Entity()
export class Factory {
  @PrimaryColumn('varchar', { length: 42 })
  id!: string;

  // https://typeorm.io/#/entities/primary-columns
  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string

  @Column('integer')
  blockNumber!: number;

  @Column('numeric', { default: BigInt(0), transformer: bigintTransformer })
  poolCount!: bigint;

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  totalValueLockedETH!: GraphDecimal;

  @Column('numeric', { default: BigInt(0), transformer: bigintTransformer })
  txCount!: bigint;

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  totalValueLockedUSD!: GraphDecimal;

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  totalVolumeUSD!: GraphDecimal

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  totalVolumeETH!: GraphDecimal

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  totalFeesUSD!: GraphDecimal

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  totalFeesETH!: GraphDecimal

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  untrackedVolumeUSD!: GraphDecimal

  // TODO: Add remaining fields when they are used.
}
