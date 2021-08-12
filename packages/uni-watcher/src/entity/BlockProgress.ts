//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity()
@Index(['blockHash'], { unique: true })
@Index(['blockNumber'])
@Index(['parentHash'])
export class BlockProgress {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column('varchar', { length: 66 })
  blockHash!: string;

  @Column('varchar', { length: 66 })
  parentHash!: string;

  @Column('integer')
  blockNumber!: number;

  @Column('integer')
  blockTimestamp!: number;

  @Column('integer')
  numEvents!: number;

  @Column('integer')
  numProcessedEvents!: number;

  @Column('integer')
  lastProcessedEventIndex!: number;

  @Column('boolean')
  isComplete!: boolean

  @Column('boolean', { default: false })
  isPruned!: boolean
}
