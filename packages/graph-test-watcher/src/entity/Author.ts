//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column } from 'typeorm';
import Decimal from 'decimal.js';

import { bigintTransformer, decimalTransformer } from '@vulcanize/util';

@Entity()
export class Author {
  @PrimaryColumn('varchar')
  id!: string;

  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string;

  @Column('integer')
  blockNumber!: number;

  @Column('numeric', { transformer: bigintTransformer })
  blogCount!: bigint;

  @Column('varchar')
  name!: string;

  @Column('integer')
  paramInt!: number;

  @Column('numeric', { transformer: bigintTransformer })
  paramBigInt!: bigint;

  @Column('varchar')
  paramBytes!: string;

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  rating!: Decimal;
}
