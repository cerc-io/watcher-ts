//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity()
@Index(['blockHash', 'contractAddress', 'owner', 'operator'], { unique: true })
export class IsApprovedForAll {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column('varchar', { length: 66 })
  blockHash!: string;

  @Column('integer')
  blockNumber!: number;

  @Column('varchar', { length: 42 })
  contractAddress!: string;

  @Column('varchar', { length: 42 })
  owner!: string;

  @Column('varchar', { length: 42 })
  operator!: string;

  @Column('boolean')
  value!: boolean;

  @Column('text', { nullable: true })
  proof!: string;
}
