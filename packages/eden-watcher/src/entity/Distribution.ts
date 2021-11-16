//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column } from 'typeorm';

import { bigintTransformer } from '@vulcanize/util';

@Entity()
export class Distribution {
  @PrimaryColumn('varchar')
  id!: string;

  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string;

  @Column('integer')
  blockNumber!: number;

  @Column('varchar')
  distributor!: string;

  @Column('bigint', { transformer: bigintTransformer })
  timestamp!: bigint;

  @Column('bigint', { transformer: bigintTransformer })
  distributionNumber!: bigint;

  @Column('varchar')
  merkleRoot!: string;

  @Column('varchar')
  metadataURI!: string;
}
