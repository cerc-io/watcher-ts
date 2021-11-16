//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, ManyToOne } from 'typeorm';
import { RewardScheduleEntry } from './RewardScheduleEntry';
import { Epoch } from './Epoch';

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

  @ManyToOne(() => Epoch, { nullable: true })
  lastEpoch!: Epoch;

  @ManyToOne(() => Epoch, { nullable: true })
  pendingEpoch!: Epoch;

  @ManyToOne(() => RewardScheduleEntry, { nullable: true })
  activeRewardScheduleEntry!: RewardScheduleEntry;
}
