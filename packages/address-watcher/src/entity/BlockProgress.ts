//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, Index } from 'typeorm';

@Entity()
@Index(['blockNumber'])
export class BlockProgress {
  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string;

  @Column('integer')
  blockNumber!: number;

  @Column('integer')
  numTx!: number;

  @Column('integer')
  numTracedTx!: number;

  @Column('boolean')
  isComplete!: boolean;
}
