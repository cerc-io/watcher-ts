//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column } from 'typeorm';

enum EnumType {
  choice1 = 'choice1',
  choice2 = 'choice2'
}

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

  @Column({
    type: 'enum',
    enum: EnumType,
    default: EnumType.choice1
  })
  paramEnum!: EnumType
}
