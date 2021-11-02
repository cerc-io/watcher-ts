//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity()
export class Network {
  @PrimaryColumn('varchar')
  id!: string;

  @Column('varchar', { nullable: true })
  slot0!: string | null

  @Column('varchar', { nullable: true })
  slot1!: string | null

  @Column('varchar', { nullable: true })
  slot2!: string | null

  @Column('varchar', { array: true })
  stakers!: string[]

  @Column('bigint', { nullable: true })
  numStakers!: bigint

  @Column('bigint')
  totalStaked!: bigint

  @Column('bigint', { array: true })
  stakedPercentiles!: bigint[]
}
