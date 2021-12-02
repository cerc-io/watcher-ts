//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, ManyToOne } from 'typeorm';
import { graphDecimalTransformer, GraphDecimal } from '@vulcanize/util';

import { Token } from './Token';

@Entity()
export class TokenDayData {
  @PrimaryColumn('varchar')
  id!: string;

  // https://typeorm.io/#/entities/primary-columns
  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string

  @Column('integer')
  blockNumber!: number;

  @Column('integer')
  date!: number

  @ManyToOne(() => Token, { onDelete: 'CASCADE' })
  token!: Token

  @Column('numeric', { transformer: graphDecimalTransformer })
  high!: GraphDecimal;

  @Column('numeric', { transformer: graphDecimalTransformer })
  low!: GraphDecimal;

  @Column('numeric', { transformer: graphDecimalTransformer })
  open!: GraphDecimal;

  @Column('numeric', { transformer: graphDecimalTransformer })
  close!: GraphDecimal;

  @Column('numeric', { transformer: graphDecimalTransformer })
  priceUSD!: GraphDecimal

  @Column('numeric', { transformer: graphDecimalTransformer })
  totalValueLocked!: GraphDecimal

  @Column('numeric', { transformer: graphDecimalTransformer })
  totalValueLockedUSD!: GraphDecimal

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  volumeUSD!: GraphDecimal

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  volume!: GraphDecimal

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  untrackedVolumeUSD!: GraphDecimal

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
  feesUSD!: GraphDecimal
}
