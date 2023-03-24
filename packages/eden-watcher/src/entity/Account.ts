//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, Index } from 'typeorm';

import { bigintTransformer } from '@cerc-io/util';

@Entity()
@Index(['blockNumber'])
export class Account {
  @PrimaryColumn('varchar')
  id!: string;

  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string;

  @Column('integer')
  blockNumber!: number;

  @Column('numeric', { transformer: bigintTransformer })
  totalClaimed!: bigint;

  @Column('numeric', { transformer: bigintTransformer })
  totalSlashed!: bigint;

  @Column('boolean', { default: false })
  isPruned!: boolean;
}
