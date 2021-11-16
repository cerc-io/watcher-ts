//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, ManyToOne } from 'typeorm';
import { Distributor } from './Distributor';
import { bigintTransformer } from '@vulcanize/util';

@Entity()
export class Distribution {
  @PrimaryColumn('varchar')
  id!: string;

  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string;

  @Column('integer')
  blockNumber!: number;

  @ManyToOne(() => Distributor)
  distributor!: Distributor;

  @Column('bigint', { transformer: bigintTransformer })
  timestamp!: bigint;

  @Column('bigint', { transformer: bigintTransformer })
  distributionNumber!: bigint;

  @Column('varchar')
  merkleRoot!: string;

  @Column('varchar')
  metadataURI!: string;
}
