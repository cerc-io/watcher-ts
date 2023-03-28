//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { SyncStatusInterface } from '@cerc-io/util';

@Entity()
export class SyncStatus implements SyncStatusInterface {
  @PrimaryGeneratedColumn()
    id!: number;

  @Column('varchar', { length: 66 })
    chainHeadBlockHash!: string;

  @Column('integer')
    chainHeadBlockNumber!: number;

  @Column('varchar', { length: 66 })
    latestIndexedBlockHash!: string;

  @Column('integer')
    latestIndexedBlockNumber!: number;

  @Column('varchar', { length: 66 })
    latestCanonicalBlockHash!: string;

  @Column('integer')
    latestCanonicalBlockNumber!: number;

  @Column('varchar', { length: 66 })
    initialIndexedBlockHash!: string;

  @Column('integer')
    initialIndexedBlockNumber!: number;
}
