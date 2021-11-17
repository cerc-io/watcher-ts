//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column } from 'typeorm';
import { bigintTransformer } from '@vulcanize/util';

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

  @Column('bigint', { transformer: bigintTransformer })
  _blockNumber!: bigint;

  @Column('varchar')
  producer!: string;

  @Column({
    type: 'enum',
    enum: ProducerSetChangeType
  })
  changeType!: ProducerSetChangeType;
}
