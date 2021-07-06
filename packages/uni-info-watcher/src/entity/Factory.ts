import { Entity, Column, Index, PrimaryColumn } from 'typeorm';

@Entity()
@Index(['blockNumber', 'id'], { unique: true })
export class Factory {
  @PrimaryColumn('varchar', { length: 42 })
  id!: string;

  @Column('numeric')
  blockNumber!: number;

  @Column('numeric', { default: 0 })
  poolCount!: number;
}
