//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, ManyToOne } from 'typeorm';
import { Epoch } from './Epoch';
import { bigintTransformer } from '@vulcanize/util';

@Entity()
export class ProducerEpoch {
  @PrimaryColumn('varchar')
  id!: string;

  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string;

  @Column('integer')
  blockNumber!: number;

  @Column('varchar')
  address!: string;

  @ManyToOne(() => Epoch)
  epoch!: Epoch;

  @Column('bigint', { transformer: bigintTransformer })
  totalRewards!: bigint;

  @Column('bigint', { transformer: bigintTransformer })
  blocksProduced!: bigint;

  @Column('varchar')
  blocksProducedRatio!: string;
}
