//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, ManyToOne } from 'typeorm';

import { bigintTransformer } from '@vulcanize/util';

import { Staker } from './Staker';

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

  @ManyToOne(() => Staker)
  stakers!: Staker;

  @Column('bigint', { nullable: true, transformer: bigintTransformer })
  numStakers!: bigint;

  @Column('bigint', { transformer: bigintTransformer })
  totalStaked!: bigint;

  @Column('bigint', { array: true })
  stakedPercentiles!: bigint[];
}
