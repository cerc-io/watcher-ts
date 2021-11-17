//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column } from 'typeorm';

import { bigintTransformer } from '@vulcanize/util';

@Entity()
export class Claim {
  @PrimaryColumn('varchar')
  id!: string;

  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string;

  @Column('integer')
  blockNumber!: number;

  @Column('bigint', { transformer: bigintTransformer })
  timestamp!: bigint;

  @Column('bigint', { transformer: bigintTransformer })
  index!: bigint;

  @Column('varchar')
  account!: string;

  @Column('bigint', { transformer: bigintTransformer })
  totalEarned!: bigint;

  @Column('bigint', { transformer: bigintTransformer })
  claimed!: bigint;
}
