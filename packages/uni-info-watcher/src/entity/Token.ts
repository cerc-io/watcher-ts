import { Entity, PrimaryColumn, Column, Index } from 'typeorm';

@Entity()
@Index(['blockNumber', 'id'])
export class Token {
  @PrimaryColumn('varchar', { length: 42 })
  id!: string;

  @PrimaryColumn('numeric')
  blockNumber!: number;

  @Column('varchar')
  symbol!: string;

  @Column('varchar')
  name!: string;

  @Column('numeric')
  totalSupply!: number;

  // TODO: Add remaining fields when they are used.
}
