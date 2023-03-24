//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, Index } from 'typeorm';
import { bigintTransformer } from '@cerc-io/util';

@Entity()
@Index(['blockNumber'])
export class RewardScheduleEntry {
  @PrimaryColumn('varchar')
  id!: string;

  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string;

  @Column('integer')
  blockNumber!: number;

  @Column('numeric', { transformer: bigintTransformer })
  startTime!: bigint;

  @Column('numeric', { transformer: bigintTransformer })
  epochDuration!: bigint;

  @Column('numeric', { transformer: bigintTransformer })
  rewardsPerEpoch!: bigint;

  @Column('boolean', { default: false })
  isPruned!: boolean;
}
