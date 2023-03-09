//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, Index } from 'typeorm';
import Decimal from 'decimal.js';

import { bigintTransformer, decimalTransformer } from '@cerc-io/util';

@Entity()
@Index(['blockNumber'])
export class SlotClaim {
  @PrimaryColumn('varchar')
  id!: string;

  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string;

  @Column('integer')
  blockNumber!: number;

  @Column('varchar')
  slot!: string;

  @Column('varchar')
  owner!: string;

  @Column('numeric', { transformer: bigintTransformer })
  winningBid!: bigint;

  @Column('numeric', { transformer: bigintTransformer })
  oldBid!: bigint;

  @Column('numeric', { transformer: bigintTransformer })
  startTime!: bigint;

  @Column('numeric', { transformer: bigintTransformer })
  expirationTime!: bigint;

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  taxRatePerDay!: Decimal;

  @Column('boolean', { default: false })
  isPruned!: boolean;
}
