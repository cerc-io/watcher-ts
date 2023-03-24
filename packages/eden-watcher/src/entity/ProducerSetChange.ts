//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, Index } from 'typeorm';
import { bigintTransformer } from '@cerc-io/util';

enum ProducerSetChangeType {
  Added = 'Added',
  Removed = 'Removed'
}

@Entity()
@Index(['blockNumber'])
export class ProducerSetChange {
  @PrimaryColumn('varchar')
  id!: string;

  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string;

  @Column('integer')
  blockNumber!: number;

  @Column('numeric', { transformer: bigintTransformer })
  _blockNumber!: bigint;

  @Column('varchar')
  producer!: string;

  @Column({
    type: 'enum',
    enum: ProducerSetChangeType
  })
  changeType!: ProducerSetChangeType;

  @Column('boolean', { default: false })
  isPruned!: boolean;
}
