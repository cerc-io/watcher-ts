import { Entity, PrimaryColumn, Column, ManyToMany, JoinTable } from 'typeorm';
import { Trace } from './Trace';

@Entity()
export class Account {
  @PrimaryColumn('varchar', { length: 42 })
  address!: string;

  @Column('numeric')
  startingBlock!: number;

  @ManyToMany(() => Trace, trace => trace.accounts)
  @JoinTable()
  appearances: Trace[];
}
