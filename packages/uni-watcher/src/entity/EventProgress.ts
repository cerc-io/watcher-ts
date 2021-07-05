import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

// Stores a row if events for a (block, token) combination have already been fetched.
//
// Required as a particular block may not have events from a particular contract,
// and we need to differentiate between that case and the case where data hasn't
// yet been synced from upstream.
//
@Entity()
@Index(['blockHash', 'contract'], { unique: true })
export class EventSyncProgress {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column('varchar', { length: 66 })
  blockHash!: string;

  @Column('varchar', { length: 42 })
  contract!: string;
}
