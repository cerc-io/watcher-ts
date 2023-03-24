//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, Index } from 'typeorm';

@Entity()
@Index(['blockNumber'])
export class ProducerSet {
  @PrimaryColumn('varchar')
  id!: string;

  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string;

  @Column('integer')
  blockNumber!: number;

  @Column('varchar', { array: true })
  producers!: string[];

  @Column('boolean', { default: false })
  isPruned!: boolean;
}
