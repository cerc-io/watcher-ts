//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column } from 'typeorm';
import Decimal from 'decimal.js';

import { bigintTransformer, decimalTransformer } from '@vulcanize/util';

@Entity()
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

  @Column('bigint', { transformer: bigintTransformer })
  winningBid!: bigint;

  @Column('bigint', { transformer: bigintTransformer })
  oldBid!: bigint;

  @Column('bigint', { transformer: bigintTransformer })
  startTime!: bigint;

  @Column('bigint', { transformer: bigintTransformer })
  expirationTime!: bigint;

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  taxRatePerDay!: Decimal;
}
