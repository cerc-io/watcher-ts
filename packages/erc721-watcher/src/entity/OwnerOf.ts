//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';
import { bigintTransformer } from '@vulcanize/util';

@Entity()
@Index(['blockHash', 'contractAddress', 'tokenId'], { unique: true })
export class OwnerOf {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column('varchar', { length: 66 })
  blockHash!: string;

  @Column('integer')
  blockNumber!: number;

  @Column('varchar', { length: 42 })
  contractAddress!: string;

  @Column('numeric', { transformer: bigintTransformer })
  tokenId!: bigint;

  @Column('varchar')
  value!: string;

  @Column('text', { nullable: true })
  proof!: string;
}
