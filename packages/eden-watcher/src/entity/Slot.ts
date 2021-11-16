//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, ManyToOne } from 'typeorm';
import { SlotClaim } from './SlotClaim';
import { bigintTransformer } from '@vulcanize/util';

@Entity()
export class Slot {
  @PrimaryColumn('varchar')
  id!: string;

  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string;

  @Column('integer')
  blockNumber!: number;

  @Column('varchar')
  owner!: string;

  @Column('varchar')
  delegate!: string;

  @Column('bigint', { transformer: bigintTransformer })
  winningBid!: bigint;

  @Column('bigint', { transformer: bigintTransformer })
  oldBid!: bigint;

  @Column('bigint', { transformer: bigintTransformer })
  startTime!: bigint;

  @Column('bigint', { transformer: bigintTransformer })
  expirationTime!: bigint;

  @Column('varchar')
  taxRatePerDay!: string;

  @ManyToOne(() => SlotClaim)
  claims!: SlotClaim;
}
