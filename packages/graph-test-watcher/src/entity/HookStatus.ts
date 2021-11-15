//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class HookStatus {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column('integer')
  latestProcessedBlockNumber!: number;
}
