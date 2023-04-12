//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne } from 'typeorm';
import { StateKind } from '@cerc-io/util';
import { BlockProgress } from './BlockProgress';

@Entity()
@Index(['cid'], { unique: true })
@Index(['block', 'contractAddress'])
@Index(['block', 'contractAddress', 'kind'], { unique: true })
export class State {
  @PrimaryGeneratedColumn()
    id!: number;

  @ManyToOne(() => BlockProgress, { onDelete: 'CASCADE' })
    block!: BlockProgress;

  @Column('varchar', { length: 42 })
    contractAddress!: string;

  @Column('varchar')
    cid!: string;

  @Column({ type: 'enum', enum: StateKind })
    kind!: StateKind;

  @Column('bytea')
    data!: Buffer;
}
