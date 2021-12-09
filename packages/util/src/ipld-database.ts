//
// Copyright 2021 Vulcanize, Inc.
//

import { FindConditions, Repository } from 'typeorm';
import { IPLDBlockInterface, ContractInterface } from './types';
import { Database } from './database';

export class IPLDDatabase extends Database {
  async getContracts (repo: Repository<ContractInterface>, where: FindConditions<ContractInterface>): Promise<ContractInterface[]> {
    return repo.find({ where });
  }

  async getLatestIPLDBlock (repo: Repository<IPLDBlockInterface>, contractAddress: string, kind: string | null, blockNumber?: number): Promise<IPLDBlockInterface | undefined> {
    let queryBuilder = repo.createQueryBuilder('ipld_block')
      .leftJoinAndSelect('ipld_block.block', 'block')
      .where('block.is_pruned = false')
      .andWhere('ipld_block.contract_address = :contractAddress', { contractAddress })
      .orderBy('block.block_number', 'DESC');

    // Filter out blocks after the provided block number.
    if (blockNumber) {
      queryBuilder.andWhere('block.block_number <= :blockNumber', { blockNumber });
    }

    // Filter using kind if specified else order by id to give preference to checkpoint.
    queryBuilder = kind
      ? queryBuilder.andWhere('ipld_block.kind = :kind', { kind })
      : queryBuilder.andWhere('ipld_block.kind != :kind', { kind: 'diff_staged' })
        .addOrderBy('ipld_block.id', 'DESC');

    return queryBuilder.getOne();
  }

  async getIPLDBlocks (repo: Repository<IPLDBlockInterface>, where: FindConditions<IPLDBlockInterface>): Promise<IPLDBlockInterface[]> {
    return repo.find({ where, relations: ['block'] });
  }
}
