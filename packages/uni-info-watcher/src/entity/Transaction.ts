//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, OneToMany } from 'typeorm';
import { graphDecimalTransformer, GraphDecimal, bigintTransformer } from '@vulcanize/util';

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

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  ethPriceUSD!: GraphDecimal

  @Column('numeric', { transformer: bigintTransformer })
  timestamp!: bigint;

  @OneToMany(() => Mint, mint => mint.transaction)
  mints!: Mint[];

  @OneToMany(() => Burn, burn => burn.transaction)
  burns!: Burn[];

  @OneToMany(() => Swap, swap => swap.transaction)
  swaps!: Swap[];
}
