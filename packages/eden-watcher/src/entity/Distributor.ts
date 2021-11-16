//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, ManyToOne } from 'typeorm';
import { Distribution } from './Distribution';

@Entity()
export class Distributor {
  @PrimaryColumn('varchar')
  id!: string;

  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string;

  @Column('integer')
  blockNumber!: number;

  @ManyToOne(() => Distribution, { nullable: true })
  currentDistribution!: Distribution;
}
