//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne } from 'typeorm';
import { BlockProgress } from './BlockProgress';

@Entity()
@Index(['cid'], { unique: true })
@Index(['block', 'contractAddress'])
@Index(['block', 'contractAddress', 'kind'], { unique: true })
export class IPLDBlock {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => BlockProgress, { onDelete: 'CASCADE' })
  block!: BlockProgress;

  @Column('varchar', { length: 42 })
  contractAddress!: string;

  @Column('varchar')
  cid!: string;

  @Column('varchar')
  kind!: string;

  @Column('bytea')
  data!: Buffer;
}
