//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class IpldStatus {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column('integer')
  latestHooksBlockNumber!: number;

  @Column('integer')
  latestCheckpointBlockNumber!: number;

  @Column('integer')
  latestIPFSBlockNumber!: number;
}
