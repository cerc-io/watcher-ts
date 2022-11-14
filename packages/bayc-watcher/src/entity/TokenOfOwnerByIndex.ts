//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';
import { bigintTransformer } from '@cerc-io/util';

@Entity()
@Index(['blockHash', 'contractAddress', 'owner', 'index'], { unique: true })
export class TokenOfOwnerByIndex {
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
  index!: bigint;

  @Column('numeric', { transformer: bigintTransformer })
  value!: bigint;

  @Column('text', { nullable: true })
  proof!: string;
}
