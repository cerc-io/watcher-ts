//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity()
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
}
