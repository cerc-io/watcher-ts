//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne } from 'typeorm';
import { BlockProgress } from './BlockProgress';

@Entity()
// Index to query all events for a contract efficiently.
@Index(['block', 'contract'])
// Index to query events by name efficiently.
@Index(['block', 'contract', 'eventName'])
export class Event {
  @PrimaryGeneratedColumn()
    id!: number;

  @ManyToOne(() => BlockProgress, { onDelete: 'CASCADE' })
    block!: BlockProgress;

  @Column('varchar', { length: 66 })
    txHash!: string;

  // Index of the log in the block.
  @Column('integer')
    index!: number;

  @Column('varchar', { length: 42 })
    contract!: string;

  @Column('varchar', { length: 256 })
    eventName!: string;

  @Column('text')
    eventInfo!: string;

  @Column('text')
    extraInfo!: string;

  @Column('text')
    proof!: string;
}
