//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column } from 'typeorm';
import { bigintTransformer } from '@vulcanize/util';

@Entity()
export class ExampleEntity {
  @PrimaryColumn('varchar')
  id!: string;

  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string;

  @Column('integer')
  blockNumber!: number;

  @Column('bigint', { transformer: bigintTransformer })
  count!: bigint;

  @Column('varchar')
  paramString!: string

  @Column('integer')
  paramInt!: number

  @Column('boolean')
  paramBoolean!: boolean

  @Column('varchar')
  paramBytes!: string
}
