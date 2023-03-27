//
// Copyright 2023 Vulcanize, Inc.
//

import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class StateSyncStatus {
  @PrimaryGeneratedColumn()
    id!: number;

  @Column('integer')
    latestIndexedBlockNumber!: number;

  @Column('integer', { nullable: true })
    latestCheckpointBlockNumber!: number;
}
