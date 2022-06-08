//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';
import { bigintTransformer } from '@vulcanize/util';

@Entity()
@Index(['blockHash', 'contractAddress', 'owner'], { unique: true })
export class BalanceOf {
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

  @Column('numeric', { transformer: bigintTransformer })
  value!: bigint;

  @Column('text', { nullable: true })
  proof!: string;
}
