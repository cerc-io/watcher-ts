import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity()
@Index(['blockHash', 'token', 'owner'], { unique: true })
export class Balance {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column('varchar', { length: 66 })
  blockHash!: string;

  @Column('varchar', { length: 42 })
  token!: string;

  @Column('varchar', { length: 42 })
  owner!: string;

  @Column('numeric')
  value!: bigint;

  @Column('text')
  proof!: string;
}
