import { Entity, PrimaryColumn, Column, Index, ManyToOne } from 'typeorm';

import { Token } from './Token';

@Entity()
@Index(['blockNumber', 'id'])
export class Pool {
  @PrimaryColumn('varchar', { length: 42 })
  id!: string;

  @PrimaryColumn('numeric')
  blockNumber!: number;

  @ManyToOne(() => Token)
  token0!: Token;

  @ManyToOne(() => Token)
  token1!: Token;

  @Column('numeric')
  feeTier!: bigint

  // TODO: Add remaining fields when they are used.
}
