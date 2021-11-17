//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column } from 'typeorm';

import { bigintArrayTransformer, bigintTransformer } from '@vulcanize/util';

@Entity()
export class Network {
  @PrimaryColumn('varchar')
  id!: string;

  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string;

  @Column('integer')
  blockNumber!: number;

  @Column('varchar', { nullable: true })
  slot0!: string;

  @Column('varchar', { nullable: true })
  slot1!: string;

  @Column('varchar', { nullable: true })
  slot2!: string;

  @Column('varchar', { array: true })
  stakers!: string[];

  @Column('bigint', { nullable: true, transformer: bigintTransformer })
  numStakers!: bigint;

  @Column('bigint', { transformer: bigintTransformer })
  totalStaked!: bigint;

  @Column('bigint', { transformer: bigintArrayTransformer, array: true })
  stakedPercentiles!: bigint[];
}
