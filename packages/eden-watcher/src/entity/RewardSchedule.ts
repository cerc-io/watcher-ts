//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, Index } from 'typeorm';

@Entity()
@Index(['blockNumber'])
export class RewardSchedule {
  @PrimaryColumn('varchar')
  id!: string;

  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string;

  @Column('integer')
  blockNumber!: number;

  @Column('varchar', { array: true })
  rewardScheduleEntries!: string[];

  @Column('varchar', { nullable: true })
  lastEpoch!: string;

  @Column('varchar', { nullable: true })
  pendingEpoch!: string;

  @Column('varchar', { nullable: true })
  activeRewardScheduleEntry!: string;

  @Column('boolean', { default: false })
  isPruned!: boolean;
}
