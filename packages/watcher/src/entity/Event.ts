import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity()
// Index to query all events for a contract efficiently.
@Index(['blockHash', 'token'])
// Index to query 'Transfer' events efficiently.
@Index(['blockHash', 'token', 'eventName', 'transferFrom', 'transferTo'])
// Index to query 'Approval' events efficiently.
@Index(['blockHash', 'token', 'eventName', 'approvalOwner', 'approvalSpender'])
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

  // Transfer event columns.
  @Column('varchar', { length: 42, nullable: true })
  transferFrom!: string;

  @Column('varchar', { length: 42, nullable: true })
  transferTo!: string;

  @Column('numeric', { nullable: true })
  transferValue!: BigInt;

  // Approval event columns.
  @Column('varchar', { length: 42, nullable: true })
  approvalOwner!: string;

  @Column('varchar', { length: 42, nullable: true })
  approvalSpender!: string;

  @Column('numeric', { nullable: true })
  approvalValue!: BigInt;
}
