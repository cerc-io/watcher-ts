import { Entity, PrimaryColumn, Column } from 'typeorm';
import Decimal from 'decimal.js';
import { decimalTransformer } from '@vulcanize/util';

@Entity()
export class UniswapDayData {
  @PrimaryColumn('varchar')
  id!: string;

  // https://typeorm.io/#/entities/primary-columns
  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string

  @Column('integer')
  blockNumber!: number;

  @Column('integer')
  date!: number

  @Column('numeric', { transformer: decimalTransformer })
  tvlUSD!: Decimal

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  volumeUSD!: Decimal

  @Column('bigint')
  txCount!: bigint;

  @Column('numeric', { transformer: decimalTransformer, default: 0 })
  volumeETH!: Decimal

  @Column('numeric', { transformer: decimalTransformer, default: 0 })
  feesUSD!: Decimal
}
