//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, Index } from 'typeorm';
import { bigintTransformer } from '@cerc-io/util';

@Entity()
@Index(['blockNumber'])
export class Producer {
  @PrimaryColumn('varchar')
  id!: string;

  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string;

  @Column('integer')
  blockNumber!: number;

  @Column('boolean')
  active!: boolean;

  @Column('varchar', { nullable: true })
  rewardCollector!: string;

  @Column('numeric', { transformer: bigintTransformer })
  rewards!: bigint;

  @Column('numeric', { transformer: bigintTransformer })
  confirmedBlocks!: bigint;

  @Column('numeric', { transformer: bigintTransformer })
  pendingEpochBlocks!: bigint;

  @Column('boolean', { default: false })
  isPruned!: boolean;
}
