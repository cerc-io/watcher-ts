//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

export const KIND_FACTORY = 'factory';
export const KIND_POOL = 'pool';
export const KIND_NFPM = 'nfpm';

@Entity()
@Index(['address'], { unique: true })
export class Contract {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column('varchar', { length: 42 })
  address!: string;

  @Column('varchar', { length: 8 })
  kind!: string;

  @Column('boolean')
  checkpoint!: boolean;

  @Column('integer')
  startingBlock!: number;
}
