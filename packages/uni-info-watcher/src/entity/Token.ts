import { Entity, PrimaryColumn, Column, ManyToMany, JoinTable } from 'typeorm';
import { Pool } from './Pool';

@Entity()
export class Token {
  @PrimaryColumn('varchar', { length: 42 })
  id!: string;

  @PrimaryColumn('integer')
  blockNumber!: number;

  @Column('varchar')
  symbol!: string;

  @Column('varchar')
  name!: string;

  @Column('numeric')
  totalSupply!: number;

  @Column('numeric', { default: 0 })
  derivedETH!: number;

  @ManyToMany(() => Pool)
  @JoinTable()
  whitelistPools!: Pool[];

  // TODO: Add remaining fields when they are used.
}
