//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, Index, ManyToMany } from 'typeorm';

import { Account } from './Account';

@Entity()
@Index(['txHash'], { unique: true })
@Index(['blockNumber'])
export class Trace {
  @PrimaryColumn('varchar', { length: 66 })
  txHash!: string;

  @Column('integer')
  blockNumber!: number;

  @Column('varchar', { length: 66 })
  blockHash!: string;

  @Column('text')
  trace!: string;

  @ManyToMany(() => Account, account => account.appearances, { eager: true, cascade: ['insert'] })
  accounts: Account[];
}
