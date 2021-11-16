//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, ManyToOne } from 'typeorm';

import { RewardScheduleEntry } from './RewardScheduleEntry';

@Entity()
export class RewardSchedule {
  @PrimaryColumn('varchar')
  id!: string;

  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string;

  @Column('integer')
  blockNumber!: number;

  @ManyToOne(() => RewardScheduleEntry)
  rewardScheduleEntries!: RewardScheduleEntry;

  @Column('varchar', { nullable: true })
  lastEpoch!: string;

  @Column('varchar', { nullable: true })
  pendingEpoch!: string;

  @Column('varchar', { nullable: true })
  activeRewardScheduleEntry!: string;
}
