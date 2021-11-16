//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column } from 'typeorm';
import { bigintTransformer } from '@vulcanize/util';

@Entity()
export class RewardScheduleEntry {
  @PrimaryColumn('varchar')
  id!: string;

  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string;

  @Column('integer')
  blockNumber!: number;

  @Column('bigint', { transformer: bigintTransformer })
  startTime!: bigint;

  @Column('bigint', { transformer: bigintTransformer })
  epochDuration!: bigint;

  @Column('bigint', { transformer: bigintTransformer })
  rewardsPerEpoch!: bigint;
}
