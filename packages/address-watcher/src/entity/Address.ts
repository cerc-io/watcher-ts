import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity()
@Index(['address'], { unique: true })
export class Address {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column('varchar', { length: 42 })
  address!: string;

  @Column('numeric')
  startingBlock!: bigint;
}
