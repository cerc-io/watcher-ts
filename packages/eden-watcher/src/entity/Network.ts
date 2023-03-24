//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, Index } from 'typeorm';

import { bigintArrayTransformer, bigintTransformer } from '@cerc-io/util';

@Entity()
@Index(['blockNumber'])
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

  @Column('numeric', { nullable: true, transformer: bigintTransformer })
  numStakers!: bigint;

  @Column('numeric', { transformer: bigintTransformer })
  totalStaked!: bigint;

  // https://github.com/brianc/node-postgres/issues/1943#issuecomment-520500053
  @Column('varchar', { transformer: bigintArrayTransformer, array: true })
  stakedPercentiles!: bigint[];

  @Column('boolean', { default: false })
  isPruned!: boolean;
}
