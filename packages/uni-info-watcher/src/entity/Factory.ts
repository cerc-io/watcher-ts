import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity()
export class Factory {
  @PrimaryColumn('varchar', { length: 42 })
  id!: string;

  @PrimaryColumn('integer')
  blockNumber!: number;

  @Column('numeric', { default: BigInt(0) })
  poolCount!: bigint;

  // TODO: Add remaining fields when they are used.
}
