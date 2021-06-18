import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity()
@Index(['txHash'], { unique: true })
export class Trace {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column('varchar', { length: 66 })
  txHash!: string;

  @Column('numeric')
  blockNumber!: number;

  @Column('varchar', { length: 66 })
  blockHash!: string;

  @Column('text')
  trace!: string;
}
