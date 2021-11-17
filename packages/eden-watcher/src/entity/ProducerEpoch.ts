//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column } from 'typeorm';
import Decimal from 'decimal.js';

import { bigintTransformer, decimalTransformer } from '@vulcanize/util';

@Entity()
export class ProducerEpoch {
  @PrimaryColumn('varchar')
  id!: string;

  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string;

  @Column('integer')
  blockNumber!: number;

  @Column('varchar')
  address!: string;

  @Column('varchar')
  epoch!: string;

  @Column('bigint', { transformer: bigintTransformer })
  totalRewards!: bigint;

  @Column('bigint', { transformer: bigintTransformer })
  blocksProduced!: bigint;

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  blocksProducedRatio!: Decimal;
}
