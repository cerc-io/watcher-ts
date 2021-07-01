import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity()
// Index to query all events for a contract efficiently.
@Index(['blockHash', 'token'])
export class Event {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column('varchar', { length: 66 })
  blockHash!: string;

  @Column('varchar', { length: 42 })
  token!: string;

  @Column('varchar', { length: 256 })
  eventName!: string;

  @Column('text')
  proof!: string;
}
