//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, Index } from 'typeorm';

import { bigintArrayTransformer } from '@cerc-io/util';

enum BlogType {
  short = 'short',
  long = 'long'
}

@Entity()
@Index(['blockNumber'])
export class Blog {
  @PrimaryColumn('varchar')
  id!: string;

  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string;

  @Column('integer')
  blockNumber!: number;

  @Column({
    type: 'enum',
    enum: BlogType,
    default: BlogType.short
  })
  kind!: BlogType;

  @Column('boolean')
  isActive!: boolean;

  @Column('numeric', { transformer: bigintArrayTransformer, array: true })
  reviews!: bigint[];

  @Column('varchar')
  author!: string;

  @Column('varchar', { array: true })
  categories!: string[];

  @Column('boolean', { default: false })
  isPruned!: boolean;
}
