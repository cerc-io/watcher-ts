//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, ManyToOne } from 'typeorm';
import Decimal from 'decimal.js';

import { ProducerEpoch } from './ProducerEpoch';
import { bigintTransformer, decimalTransformer } from '@vulcanize/util';

@Entity()
export class Epoch {
  @PrimaryColumn('varchar')
  id!: string;

  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string;

  @Column('integer')
  blockNumber!: number;

  @Column('boolean')
  finalized!: boolean;

  @Column('bigint', { transformer: bigintTransformer })
  epochNumber!: bigint;

  @Column('varchar', { nullable: true })
  startBlock!: string;

  @Column('varchar', { nullable: true })
  endBlock!: string;

  @Column('bigint', { transformer: bigintTransformer })
  producerBlocks!: bigint;

  @Column('bigint', { transformer: bigintTransformer })
  allBlocks!: bigint;

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  producerBlocksRatio!: Decimal;

  @ManyToOne(() => ProducerEpoch)
  producerRewards!: ProducerEpoch;
}
