//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, Index } from 'typeorm';
import { bigintTransformer } from '@cerc-io/util';

@Entity()
@Index(['blockNumber'])
export class Block {
  @PrimaryColumn('varchar')
  id!: string;

  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string;

  @Column('integer')
  blockNumber!: number;

  @Column('boolean')
  fromActiveProducer!: boolean;

  @Column('varchar')
  hash!: string;

  @Column('varchar')
  parentHash!: string;

  @Column('varchar')
  unclesHash!: string;

  @Column('varchar')
  author!: string;

  @Column('varchar')
  stateRoot!: string;

  @Column('varchar')
  transactionsRoot!: string;

  @Column('varchar')
  receiptsRoot!: string;

  @Column('numeric', { transformer: bigintTransformer })
  number!: bigint;

  @Column('numeric', { transformer: bigintTransformer })
  gasUsed!: bigint;

  @Column('numeric', { transformer: bigintTransformer })
  gasLimit!: bigint;

  @Column('numeric', { transformer: bigintTransformer })
  timestamp!: bigint;

  @Column('numeric', { transformer: bigintTransformer })
  difficulty!: bigint;

  @Column('numeric', { transformer: bigintTransformer })
  totalDifficulty!: bigint;

  @Column('numeric', { nullable: true, transformer: bigintTransformer })
  size!: bigint;

  @Column('boolean', { default: false })
  isPruned!: boolean;
}
