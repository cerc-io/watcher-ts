import { Entity, PrimaryColumn, Column, Index } from 'typeorm';

@Entity()
@Index(['blockNumber'])
export class BlockProgress {
  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string;

  @Column('numeric')
  blockNumber!: number;

  @Column('numeric')
  numTx!: number;

  @Column('numeric')
  numTracedTx!: number;

  @Column('boolean')
  isComplete!: boolean
}
