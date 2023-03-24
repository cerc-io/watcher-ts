//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, Index } from 'typeorm';

import { bigintTransformer } from '@cerc-io/util';

@Entity()
@Index(['blockNumber'])
export class Claim {
  @PrimaryColumn('varchar')
  id!: string;

  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string;

  @Column('integer')
  blockNumber!: number;

  @Column('numeric', { transformer: bigintTransformer })
  timestamp!: bigint;

  @Column('numeric', { transformer: bigintTransformer })
  index!: bigint;

  @Column('varchar')
  account!: string;

  @Column('numeric', { transformer: bigintTransformer })
  totalEarned!: bigint;

  @Column('numeric', { transformer: bigintTransformer })
  claimed!: bigint;

  @Column('boolean', { default: false })
  isPruned!: boolean;
}
