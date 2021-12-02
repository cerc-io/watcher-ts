//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column } from 'typeorm';
import { graphDecimalTransformer, GraphDecimal, bigintTransformer } from '@vulcanize/util';

@Entity()
export class UniswapDayData {
  @PrimaryColumn('varchar')
  id!: string;

  // https://typeorm.io/#/entities/primary-columns
  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string

  @Column('integer')
  blockNumber!: number;

  @Column('integer')
  date!: number

  @Column('numeric', { transformer: graphDecimalTransformer })
  tvlUSD!: GraphDecimal

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  volumeUSD!: GraphDecimal

  @Column('numeric', { transformer: bigintTransformer })
  txCount!: bigint;

  @Column('numeric', { transformer: graphDecimalTransformer, default: 0 })
  volumeETH!: GraphDecimal

  @Column('numeric', { transformer: graphDecimalTransformer, default: 0 })
  feesUSD!: GraphDecimal
}
