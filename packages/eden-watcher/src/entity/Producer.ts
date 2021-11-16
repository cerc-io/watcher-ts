//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column } from 'typeorm';
import { bigintTransformer } from '@vulcanize/util';

@Entity()
export class Producer {
  @PrimaryColumn('varchar')
  id!: string;

  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string;

  @Column('integer')
  blockNumber!: number;

  @Column('boolean')
  active!: boolean;

  @Column('varchar', { nullable: true })
  rewardCollector!: string;

  @Column('bigint', { transformer: bigintTransformer })
  rewards!: bigint;

  @Column('bigint', { transformer: bigintTransformer })
  confirmedBlocks!: bigint;

  @Column('bigint', { transformer: bigintTransformer })
  pendingEpochBlocks!: bigint;
}
