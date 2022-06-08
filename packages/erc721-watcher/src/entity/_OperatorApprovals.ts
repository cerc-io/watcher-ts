//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity()
@Index(['blockHash', 'contractAddress', 'key0', 'key1'], { unique: true })
export class _OperatorApprovals {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column('varchar', { length: 66 })
  blockHash!: string;

  @Column('integer')
  blockNumber!: number;

  @Column('varchar', { length: 42 })
  contractAddress!: string;

  @Column('varchar', { length: 42 })
  key0!: string;

  @Column('varchar', { length: 42 })
  key1!: string;

  @Column('boolean')
  value!: boolean;

  @Column('text', { nullable: true })
  proof!: string;
}
