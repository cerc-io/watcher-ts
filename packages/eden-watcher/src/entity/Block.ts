//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column } from 'typeorm';
import { bigintTransformer } from '@vulcanize/util';

@Entity()
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

  @Column('bigint', { transformer: bigintTransformer })
  number!: bigint;

  @Column('bigint', { transformer: bigintTransformer })
  gasUsed!: bigint;

  @Column('bigint', { transformer: bigintTransformer })
  gasLimit!: bigint;

  @Column('bigint', { transformer: bigintTransformer })
  timestamp!: bigint;

  @Column('bigint', { transformer: bigintTransformer })
  difficulty!: bigint;

  @Column('bigint', { transformer: bigintTransformer })
  totalDifficulty!: bigint;

  @Column('bigint', { nullable: true, transformer: bigintTransformer })
  size!: bigint;
}
