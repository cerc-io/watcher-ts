import Decimal from 'decimal.js';
import { Entity, Column, PrimaryColumn } from 'typeorm';
import { decimalTransformer } from '@vulcanize/util';

@Entity()
export class Factory {
  @PrimaryColumn('varchar', { length: 42 })
  id!: string;

  @PrimaryColumn('integer')
  blockNumber!: number;

  @Column('bigint', { default: BigInt(0) })
  poolCount!: bigint;

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  totalValueLockedETH!: Decimal;

  @Column('bigint', { default: BigInt(0) })
  txCount!: bigint;

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  totalValueLockedUSD!: Decimal;

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  totalVolumeUSD!: Decimal

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  totalVolumeETH!: Decimal

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  totalFeesUSD!: Decimal

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  totalFeesETH!: Decimal

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  untrackedVolumeUSD!: Decimal

  // TODO: Add remaining fields when they are used.
}
