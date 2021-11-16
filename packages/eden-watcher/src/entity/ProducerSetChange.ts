//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column } from 'typeorm';

enum ProducerSetChangeType {
  Added,
  Removed
}

@Entity()
export class ProducerSetChange {
  @PrimaryColumn('varchar')
  id!: string;

  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string;

  @Column('integer')
  blockNumber!: number;

  @Column('varchar')
  producer!: string;

  @Column('integer')
  changeType!: ProducerSetChangeType;
}
