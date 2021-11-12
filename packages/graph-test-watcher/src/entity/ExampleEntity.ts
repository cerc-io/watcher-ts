//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity()
export class ExampleEntity {
  @PrimaryColumn('varchar')
  id!: string;

  // https://typeorm.io/#/entities/primary-columns
  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string

  @Column('integer')
  blockNumber!: number;

  @Column('bigint')
  count!: bigint

  @Column('varchar')
  paramString!: string

  @Column('integer')
  paramInt!: number

  @Column('boolean')
  paramBoolean!: boolean

  @Column('varchar')
  paramBytes!: string
}
