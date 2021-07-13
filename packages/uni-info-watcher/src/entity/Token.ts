import Decimal from 'decimal.js';
import { Entity, PrimaryColumn, Column, ManyToMany, JoinTable } from 'typeorm';
import { decimalTransformer } from '@vulcanize/util';

import { Pool } from './Pool';

@Entity()
export class Token {
  @PrimaryColumn('varchar', { length: 42 })
  id!: string;

  @PrimaryColumn('integer')
  blockNumber!: number;

  @Column('varchar')
  symbol!: string;

  @Column('varchar')
  name!: string;

  @Column('numeric', { transformer: decimalTransformer })
  totalSupply!: Decimal;

  // TODO: Fetch decimals from contract using erc20-watcher. Currently using hardcoded value.
  @Column('bigint', { default: 18 })
  decimals!: bigint;

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  derivedETH!: Decimal;

  @Column('bigint', { default: BigInt(0) })
  txCount!: bigint;

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  totalValueLocked!: Decimal;

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  totalValueLockedUSD!: Decimal;

  @ManyToMany(() => Pool)
  @JoinTable()
  whitelistPools!: Pool[];

  // TODO: Add remaining fields when they are used.
}
