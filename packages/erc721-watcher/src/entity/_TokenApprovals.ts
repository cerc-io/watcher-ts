//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';
import { bigintTransformer } from '@vulcanize/util';

@Entity()
@Index(['blockHash', 'contractAddress', 'key0'], { unique: true })
export class _TokenApprovals {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column('varchar', { length: 66 })
  blockHash!: string;

  @Column('integer')
  blockNumber!: number;

  @Column('varchar', { length: 42 })
  contractAddress!: string;

  @Column('numeric', { transformer: bigintTransformer })
  key0!: bigint;

  @Column('varchar')
  value!: string;

  @Column('text', { nullable: true })
  proof!: string;
}
