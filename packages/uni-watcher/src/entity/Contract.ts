import { Entity, PrimaryColumn, Column } from 'typeorm';

export const KIND_FACTORY = 'factory';

export const KIND_POOL = 'pool';

@Entity()
export class Contract {
  @PrimaryColumn('varchar', { length: 42 })
  address!: string;

  @Column('varchar', { length: 8 })
  kind!: string;

  @Column('numeric')
  startingBlock!: number;
}
