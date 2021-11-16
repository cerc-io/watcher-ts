//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity()
export class ProducerRewardCollectorChange {
  @PrimaryColumn('varchar')
  id!: string;

  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string;

  @Column('integer')
  blockNumber!: number;

  @Column('varchar')
  producer!: string;

  @Column('varchar')
  rewardCollector!: string;
}
