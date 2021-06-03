import { Entity, PrimaryGeneratedColumn, Column, Index } from "typeorm";

@Entity()
@Index(["blockHash", "token", "owner", "spender"], { unique: true })
export class Allowance {

  @PrimaryGeneratedColumn()
  id: number;

  @Column("varchar", { length: 66 })
  blockHash: string;

  @Column("varchar", { length: 42 })
  token: string;

  @Column("varchar", { length: 42 })
  owner: string;

  @Column("varchar", { length: 42 })
  spender: string;

  @Column("numeric")
  value: number;

  @Column("text")
  proof: string;
}
