//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, ManyToOne } from 'typeorm';
import { Slot } from './Slot';
import { Staker } from './Staker';
import { bigintTransformer } from '@vulcanize/util';

@Entity()
export class Network {
  @PrimaryColumn('varchar')
  id!: string;

  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string;

  @Column('integer')
  blockNumber!: number;

  @ManyToOne(() => Slot, { nullable: true })
  slot0!: Slot;

  @ManyToOne(() => Slot, { nullable: true })
  slot1!: Slot;

  @ManyToOne(() => Slot, { nullable: true })
  slot2!: Slot;

  @ManyToOne(() => Staker)
  stakers!: Staker;

  @Column('bigint', { nullable: true, transformer: bigintTransformer })
  numStakers!: bigint;

  @Column('bigint', { transformer: bigintTransformer })
  totalStaked!: bigint;

  @Column('bigint', { array: true })
  stakedPercentiles!: bigint[];
}
