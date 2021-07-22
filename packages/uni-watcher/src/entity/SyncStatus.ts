import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class SyncStatus {
  @PrimaryGeneratedColumn()
  id!: number;

  // Latest block hash and number from the chain itself.
  @Column('varchar', { length: 66 })
  chainHeadBlockHash!: string;

  @Column('integer')
  chainHeadBlockNumber!: number;

  // Most recent block hash and number that we can consider as part
  // of the canonical/finalized chain. Reorgs older than this block
  // cannot be processed and processing will halt.
  @Column('varchar', { length: 66 })
  latestCanonicalBlockHash!: string;

  @Column('integer')
  latestCanonicalBlockNumber!: number;
}
