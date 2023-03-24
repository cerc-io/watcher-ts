//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, Index } from 'typeorm';
import Decimal from 'decimal.js';

import { bigintTransformer, decimalTransformer } from '@cerc-io/util';

@Entity()
@Index(['blockNumber'])
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

  @Column('numeric', { transformer: bigintTransformer })
  totalRewards!: bigint;

  @Column('numeric', { transformer: bigintTransformer })
  blocksProduced!: bigint;

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  blocksProducedRatio!: Decimal;

  @Column('boolean', { default: false })
  isPruned!: boolean;
}
