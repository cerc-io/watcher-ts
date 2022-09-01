//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, Index } from 'typeorm';

import { bigintTransformer } from '@vulcanize/util';

@Entity()
@Index(['blockNumber'])
export class Slash {
  @PrimaryColumn('varchar')
  id!: string;

  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string;

  @Column('integer')
  blockNumber!: number;

  @Column('numeric', { transformer: bigintTransformer })
  timestamp!: bigint;

  @Column('varchar')
  account!: string;

  @Column('numeric', { transformer: bigintTransformer })
  slashed!: bigint;
}
