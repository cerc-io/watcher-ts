import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity()
@Index(['blockHash'], { unique: true })
export class BlockProgress {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column('varchar', { length: 66 })
  blockHash!: string;

  @Column('numeric')
  blockNumber!: number;

  @Column('numeric')
  numEvents!: number;

  @Column('numeric')
  numProcessedEvents!: number;

  @Column('boolean')
  isComplete!: boolean
}
