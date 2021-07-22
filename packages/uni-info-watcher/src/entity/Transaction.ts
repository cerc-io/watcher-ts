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

  @PrimaryColumn('integer')
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
