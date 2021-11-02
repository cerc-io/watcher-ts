//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity()
export class ExampleEntity {
  @PrimaryColumn('varchar')
  id!: string;

  @Column('bigint')
  count!: bigint

  @Column('varchar')
  param1!: string

  @Column('integer')
  param2!: number
}
