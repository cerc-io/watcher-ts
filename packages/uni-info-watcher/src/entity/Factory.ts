import { Entity, Column, Index, PrimaryColumn } from 'typeorm';

@Entity()
@Index(['blockNumber', 'id'], { unique: true })
export class Factory {
  @PrimaryColumn('varchar', { length: 42 })
  id!: string;

  @PrimaryColumn('numeric')
  blockNumber!: number;

  @Column('numeric', { default: BigInt(0) })
  poolCount!: bigint;

  // TODO: Add remaining fields when they are used.
}
