//
// Copyright 2022 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, Index } from 'typeorm';

@Entity()
@Index(['blockNumber'])
export class FrothyEntity {
  @PrimaryColumn('varchar')
    id!: string;

  @PrimaryColumn('varchar')
    name!: string;

  @PrimaryColumn('varchar', { length: 66 })
    blockHash!: string;

  @Column('integer')
    blockNumber!: number;
}
