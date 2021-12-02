//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column } from 'typeorm';
import { graphDecimalTransformer, GraphDecimal } from '@vulcanize/util';

@Entity()
export class Bundle {
  @PrimaryColumn('varchar', { length: 1 })
  id!: string;

  // https://typeorm.io/#/entities/primary-columns
  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string

  @Column('integer')
  blockNumber!: number;

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  ethPriceUSD!: GraphDecimal
}
