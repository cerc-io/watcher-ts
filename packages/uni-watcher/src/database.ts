import assert from 'assert';
import _ from 'lodash';
import { Connection, ConnectionOptions, createConnection, DeepPartial } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

import { Event, UNKNOWN_EVENT_NAME } from './entity/Event';
import { Contract } from './entity/Contract';
import { BlockProgress } from './entity/BlockProgress';

export class Database {
  _config: ConnectionOptions
  _conn!: Connection

  constructor (config: ConnectionOptions) {
    assert(config);
    this._config = config;
  }

  async init (): Promise<void> {
    assert(!this._conn);

    this._conn = await createConnection({
      ...this._config,
      namingStrategy: new SnakeNamingStrategy()
    });
  }

  async close (): Promise<void> {
    return this._conn.close();
  }

  async getBlockEvents (blockHash: string): Promise<Event[]> {
    return this._conn.getRepository(Event)
      .createQueryBuilder('event')
      .innerJoinAndSelect('event.block', 'block')
      .where('block_hash = :blockHash', { blockHash })
      .addOrderBy('event.id', 'ASC')
      .getMany();
  }

  async getEvents (blockHash: string, contract: string): Promise<Event[]> {
    return this._conn.getRepository(Event)
      .createQueryBuilder('event')
      .innerJoinAndSelect('event.block', 'block')
      .where('block_hash = :blockHash AND contract = :contract', {
        blockHash,
        contract
      })
      .addOrderBy('event.id', 'ASC')
      .getMany();
  }

  async getEventsByName (blockHash: string, contract: string, eventName: string): Promise<Event[] | undefined> {
    return this._conn.getRepository(Event)
      .createQueryBuilder('event')
      .innerJoinAndSelect('event.block', 'block')
      .where('block_hash = :blockHash AND contract = :contract AND event_name = :eventName', {
        blockHash,
        contract,
        eventName
      })
      .addOrderBy('event.id', 'ASC')
      .getMany();
  }

  async getProcessedBlockCountForRange (fromBlockNumber: number, toBlockNumber: number): Promise<{ expected: number, actual: number }> {
    const blockNumbers = _.range(fromBlockNumber, toBlockNumber + 1);
    const expected = blockNumbers.length;

    const repo = this._conn.getRepository(BlockProgress);
    const { count: actual } = await repo
      .createQueryBuilder('block_progress')
      .select('COUNT(DISTINCT(block_number))', 'count')
      .where('block_number IN (:...blockNumbers) AND is_complete = :isComplete', { blockNumbers, isComplete: true })
      .getRawOne();

    return { expected, actual: parseInt(actual) };
  }

  async getEventsInRange (fromBlockNumber: number, toBlockNumber: number): Promise<Array<Event>> {
    const events = await this._conn.getRepository(Event)
      .createQueryBuilder('event')
      .innerJoinAndSelect('event.block', 'block')
      .where('block_number >= :fromBlockNumber AND block_number <= :toBlockNumber AND event_name <> :eventName', {
        fromBlockNumber,
        toBlockNumber,
        eventName: UNKNOWN_EVENT_NAME
      })
      .addOrderBy('event.id', 'ASC')
      .getMany();

    return events;
  }

  async saveEvents (block: any, events: DeepPartial<Event>[]): Promise<void> {
    const {
      hash: blockHash,
      number: blockNumber,
      timestamp: blockTimestamp,
      parent: {
        hash: parentHash
      }
    } = block;

    assert(blockHash);
    assert(blockNumber);
    assert(blockTimestamp);
    assert(parentHash);

    // In a transaction:
    // (1) Save all the events in the database.
    // (2) Add an entry to the block progress table.
    await this._conn.transaction(async (tx) => {
      const numEvents = events.length;
      const blockProgressRepo = tx.getRepository(BlockProgress);
      let blockProgress = await blockProgressRepo.findOne({ where: { blockHash } });
      if (!blockProgress) {
        const entity = blockProgressRepo.create({
          blockHash,
          parentHash,
          blockNumber,
          blockTimestamp,
          numEvents,
          numProcessedEvents: 0,
          isComplete: (numEvents === 0)
        });

        blockProgress = await blockProgressRepo.save(entity);

        // Bulk insert events.
        events.forEach(event => event.block = blockProgress);
        await tx.createQueryBuilder().insert().into(Event).values(events).execute();
      }
    });
  }

  async getEvent (id: string): Promise<Event | undefined> {
    return this._conn.getRepository(Event).findOne(id, { relations: [ 'block' ]});
  }

  async saveEventEntity (entity: Event): Promise<Event> {
    const repo = this._conn.getRepository(Event);
    return await repo.save(entity);
  }

  async getContract (address: string): Promise<Contract | undefined> {
    return this._conn.getRepository(Contract)
      .createQueryBuilder('contract')
      .where('address = :address', { address })
      .getOne();
  }

  async getLatestContract (kind: string): Promise<Contract | undefined> {
    return this._conn.getRepository(Contract)
      .createQueryBuilder('contract')
      .where('kind = :kind', { kind })
      .orderBy('id', 'DESC')
      .getOne();
  }

  async saveContract (address: string, kind: string, startingBlock: number): Promise<void> {
    await this._conn.transaction(async (tx) => {
      const repo = tx.getRepository(Contract);

      const numRows = await repo
        .createQueryBuilder()
        .where('address = :address', { address })
        .getCount();

      if (numRows === 0) {
        const entity = repo.create({ address, kind, startingBlock });
        await repo.save(entity);
      }
    });
  }

  async getBlockProgress (blockHash: string): Promise<BlockProgress | undefined> {
    const repo = this._conn.getRepository(BlockProgress);
    return repo.findOne({ where: { blockHash } });
  }

  async updateBlockProgress (blockHash: string): Promise<void> {
    await this._conn.transaction(async (tx) => {
      const repo = tx.getRepository(BlockProgress);
      const entity = await repo.findOne({ where: { blockHash } });
      if (entity && !entity.isComplete) {
        entity.numProcessedEvents++;
        if (entity.numProcessedEvents >= entity.numEvents) {
          entity.isComplete = true;
        }
        await repo.save(entity);
      }
    });
  }
}
