//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column } from 'typeorm';

import { bigintTransformer } from '@vulcanize/util';

@Entity()
export class RelatedEntity {
  @PrimaryColumn('varchar')
  id!: string;

  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string;

  @Column('integer')
  blockNumber!: number;

  @Column('bigint', { transformer: bigintTransformer })
  paramBigInt!: bigint;

  @Column('varchar', { array: true })
  examples!: string[];

  @Column('bigint', { transformer: bigintTransformer, array: true })
  bigIntArray!: bigint[];
}
