//
// Copyright 2021 Vulcanize, Inc.
//

import Decimal from 'decimal.js';
import { Entity, PrimaryColumn, Column, OneToMany } from 'typeorm';
import { decimalTransformer } from '@vulcanize/util';

import { Mint } from './Mint';
import { Burn } from './Burn';
import { Swap } from './Swap';

@Entity()
export class Transaction {
  @PrimaryColumn('varchar')
  id!: string;

  // https://typeorm.io/#/entities/primary-columns
  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string

  @Column('integer')
  blockNumber!: number;

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  ethPriceUSD!: Decimal

  @Column('bigint')
  timestamp!: BigInt;

  @OneToMany(() => Mint, mint => mint.transaction)
  mints!: Mint[];

  @OneToMany(() => Burn, burn => burn.transaction)
  burns!: Burn[];

  @OneToMany(() => Swap, swap => swap.transaction)
  swaps!: Swap[];
}
