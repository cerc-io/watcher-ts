//
// Copyright 2022 Vulcanize, Inc.
//

import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class IpldStatus {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column('integer')
  latestHooksBlockNumber!: number;

  @Column('integer', { nullable: true })
  latestCheckpointBlockNumber!: number;

  @Column('integer', { nullable: true })
  latestIPFSBlockNumber!: number;
}
