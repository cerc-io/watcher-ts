//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, Index } from 'typeorm';

import { bigintTransformer } from '@cerc-io/util';

@Entity()
@Index(['blockNumber'])
export class Distribution {
  @PrimaryColumn('varchar')
  id!: string;

  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string;

  @Column('integer')
  blockNumber!: number;

  @Column('varchar')
  distributor!: string;

  @Column('numeric', { transformer: bigintTransformer })
  timestamp!: bigint;

  @Column('numeric', { transformer: bigintTransformer })
  distributionNumber!: bigint;

  @Column('varchar')
  merkleRoot!: string;

  @Column('varchar')
  metadataURI!: string;

  @Column('boolean', { default: false })
  isPruned!: boolean;
}
