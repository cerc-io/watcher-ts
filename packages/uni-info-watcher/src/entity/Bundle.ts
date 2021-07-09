import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity()
export class Bundle {
  @PrimaryColumn('varchar', { length: 1 })
  id!: string;

  @PrimaryColumn('integer')
  blockNumber!: number;

  @Column('numeric', { default: 0 })
  ethPriceUSD!: number
}
