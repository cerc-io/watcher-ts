//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, Index } from 'typeorm';
import Decimal from 'decimal.js';

import { bigintTransformer, decimalTransformer } from '@cerc-io/util';

@Entity()
@Index(['blockNumber'])
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

  @Column('boolean', { default: false })
    isPruned!: boolean;
}
