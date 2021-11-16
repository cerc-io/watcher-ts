//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, ManyToOne } from 'typeorm';
import { Claim } from './Claim';
import { Slash } from './Slash';
import { bigintTransformer } from '@vulcanize/util';

@Entity()
export class Account {
  @PrimaryColumn('varchar')
  id!: string;

  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string;

  @Column('integer')
  blockNumber!: number;

  @Column('bigint', { transformer: bigintTransformer })
  totalClaimed!: bigint;

  @Column('bigint', { transformer: bigintTransformer })
  totalSlashed!: bigint;

  @ManyToOne(() => Claim)
  claims!: Claim;

  @ManyToOne(() => Slash)
  slashes!: Slash;
}
