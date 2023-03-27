//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity()
@Index(['blockHash', 'contractAddress', 'key0'], { unique: true })
export class IsPhisher {
  @PrimaryGeneratedColumn()
    id!: number;

  @Column('varchar', { length: 66 })
    blockHash!: string;

  @Column('integer')
    blockNumber!: number;

  @Column('varchar', { length: 42 })
    contractAddress!: string;

  @Column('varchar')
    key0!: string;

  @Column('boolean')
    value!: boolean;

  @Column('text', { nullable: true })
    proof!: string;
}
