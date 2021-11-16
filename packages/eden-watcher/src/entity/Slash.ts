//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, ManyToOne } from 'typeorm';
import { Account } from './Account';
import { bigintTransformer } from '@vulcanize/util';

@Entity()
export class Slash {
  @PrimaryColumn('varchar')
  id!: string;

  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string;

  @Column('integer')
  blockNumber!: number;

  @Column('bigint', { transformer: bigintTransformer })
  timestamp!: bigint;

  @ManyToOne(() => Account)
  account!: Account;

  @Column('bigint', { transformer: bigintTransformer })
  slashed!: bigint;
}
