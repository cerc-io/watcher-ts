//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';
import { bigintTransformer } from '@cerc-io/util';

@Entity()
@Index(['blockHash', 'blockNumber', 'token', 'owner', 'spender'], { unique: true })
export class Allowance {
  @PrimaryGeneratedColumn()
    id!: number;

  @Column('varchar', { length: 66 })
    blockHash!: string;

  @Column('integer')
    blockNumber!: number;

  @Column('varchar', { length: 42 })
    token!: string;

  @Column('varchar', { length: 42 })
    owner!: string;

  @Column('varchar', { length: 42 })
    spender!: string;

  @Column('numeric', { transformer: bigintTransformer })
    value!: bigint;

  @Column('text', { nullable: true })
    proof!: string;
}
