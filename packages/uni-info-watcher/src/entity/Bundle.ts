import { Entity, PrimaryColumn, Column } from 'typeorm';
import Decimal from 'decimal.js';
import { decimalTransformer } from '@vulcanize/util';

@Entity()
export class Bundle {
  @PrimaryColumn('varchar', { length: 1 })
  id!: string;

  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string

  @Column('integer')
  blockNumber!: number;

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  ethPriceUSD!: Decimal
}
