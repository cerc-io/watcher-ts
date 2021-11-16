//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, ManyToOne } from 'typeorm';
import { Block } from './Block';
import { ProducerEpoch } from './ProducerEpoch';
import { bigintTransformer } from '@vulcanize/util';

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

  @ManyToOne(() => Block, { nullable: true })
  startBlock!: Block;

  @ManyToOne(() => Block, { nullable: true })
  endBlock!: Block;

  @Column('bigint', { transformer: bigintTransformer })
  producerBlocks!: bigint;

  @Column('bigint', { transformer: bigintTransformer })
  allBlocks!: bigint;

  @Column('varchar')
  producerBlocksRatio!: string;

  @ManyToOne(() => ProducerEpoch)
  producerRewards!: ProducerEpoch;
}
