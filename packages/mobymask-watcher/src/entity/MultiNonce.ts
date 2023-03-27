//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';
import { bigintTransformer } from '@cerc-io/util';

@Entity()
@Index(['blockHash', 'contractAddress', 'key0', 'key1'], { unique: true })
export class MultiNonce {
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

  @Column('numeric', { transformer: bigintTransformer })
    key1!: bigint;

  @Column('numeric', { transformer: bigintTransformer })
    value!: bigint;

  @Column('text', { nullable: true })
    proof!: string;
}
