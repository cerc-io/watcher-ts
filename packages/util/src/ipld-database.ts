//
// Copyright 2021 Vulcanize, Inc.
//

import { FindConditions, MoreThan, Repository } from 'typeorm';

import { IPLDBlockInterface, HookStatusInterface, StateKind } from './types';
import { Database } from './database';
import { MAX_REORG_DEPTH } from './constants';

export class IPLDDatabase extends Database {
  async getLatestIPLDBlock (repo: Repository<IPLDBlockInterface>, contractAddress: string, kind: StateKind | null, blockNumber?: number): Promise<IPLDBlockInterface | undefined> {
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
      : queryBuilder.andWhere('ipld_block.kind != :kind', { kind: StateKind.DiffStaged })
        .addOrderBy('ipld_block.id', 'DESC');

    return queryBuilder.getOne();
  }

  async getPrevIPLDBlock (repo: Repository<IPLDBlockInterface>, blockHash: string, contractAddress: string, kind?: string): Promise<IPLDBlockInterface | undefined> {
    const heirerchicalQuery = `
      WITH RECURSIVE cte_query AS
      (
        SELECT
          b.block_hash,
          b.block_number,
          b.parent_hash,
          1 as depth,
          i.id,
          i.kind
        FROM
          block_progress b
          LEFT JOIN
            ipld_block i ON i.block_id = b.id
            AND i.contract_address = $2
        WHERE
          b.block_hash = $1
        UNION ALL
          SELECT
            b.block_hash,
            b.block_number,
            b.parent_hash,
            c.depth + 1,
            i.id,
            i.kind
          FROM
            block_progress b
            LEFT JOIN
              ipld_block i
              ON i.block_id = b.id
              AND i.contract_address = $2
            INNER JOIN
              cte_query c ON c.parent_hash = b.block_hash
            WHERE
              c.depth < $3
      )
      SELECT
        block_number, id, kind
      FROM
        cte_query
      ORDER BY block_number DESC, id DESC
    `;

    // Fetching block and id for previous IPLDBlock in frothy region.
    const queryResult = await repo.query(heirerchicalQuery, [blockHash, contractAddress, MAX_REORG_DEPTH]);
    const latestRequiredResult = kind
      ? queryResult.find((obj: any) => obj.kind === kind)
      : queryResult.find((obj: any) => obj.id);

    let result: IPLDBlockInterface | undefined;

    if (latestRequiredResult) {
      result = await repo.findOne(latestRequiredResult.id, { relations: ['block'] });
    } else {
      // If IPLDBlock not found in frothy region get latest IPLDBlock in the pruned region.
      // Filter out IPLDBlocks from pruned blocks.
      const canonicalBlockNumber = queryResult.pop().block_number + 1;

      let queryBuilder = repo.createQueryBuilder('ipld_block')
        .leftJoinAndSelect('ipld_block.block', 'block')
        .where('block.is_pruned = false')
        .andWhere('ipld_block.contract_address = :contractAddress', { contractAddress })
        .andWhere('block.block_number <= :canonicalBlockNumber', { canonicalBlockNumber })
        .orderBy('block.block_number', 'DESC');

      // Filter using kind if specified else order by id to give preference to checkpoint.
      queryBuilder = kind
        ? queryBuilder.andWhere('ipld_block.kind = :kind', { kind })
        : queryBuilder.addOrderBy('ipld_block.id', 'DESC');

      result = await queryBuilder.getOne();
    }

    return result;
  }

  async getIPLDBlocks (repo: Repository<IPLDBlockInterface>, where: FindConditions<IPLDBlockInterface>): Promise<IPLDBlockInterface[]> {
    return repo.find({ where, relations: ['block'] });
  }

  async getDiffIPLDBlocksByBlocknumber (repo: Repository<IPLDBlockInterface>, contractAddress: string, blockNumber: number): Promise<IPLDBlockInterface[]> {
    return repo.find({
      relations: ['block'],
      where: {
        contractAddress,
        kind: StateKind.Diff,
        block: {
          isPruned: false,
          blockNumber: MoreThan(blockNumber)
        }
      },
      order: {
        block: 'ASC'
      }
    });
  }

  async saveOrUpdateIPLDBlock (repo: Repository<IPLDBlockInterface>, ipldBlock: IPLDBlockInterface): Promise<IPLDBlockInterface> {
    return repo.save(ipldBlock);
  }

  async getHookStatus (repo: Repository<HookStatusInterface>): Promise<HookStatusInterface | undefined> {
    return repo.findOne();
  }

  async updateHookStatusProcessedBlock (repo: Repository<HookStatusInterface>, blockNumber: number, force?: boolean): Promise<HookStatusInterface> {
    let entity = await repo.findOne();

    if (!entity) {
      entity = repo.create({
        latestProcessedBlockNumber: blockNumber
      });
    }

    if (force || blockNumber > entity.latestProcessedBlockNumber) {
      entity.latestProcessedBlockNumber = blockNumber;
    }

    return repo.save(entity);
  }
}
