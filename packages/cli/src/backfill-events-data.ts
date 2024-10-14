//
// Copyright 2024 Vulcanize, Inc.
//

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import assert from 'assert';
import { ConnectionOptions, Repository } from 'typeorm';
import debug from 'debug';

import { DEFAULT_CONFIG_PATH, JSONbigNative, DatabaseInterface, Config, EventInterface } from '@cerc-io/util';

import { BaseCmd } from './base';

const log = debug('vulcanize:backfill-events-data');

interface Arguments {
  configFile: string;
  batchSize: number;
}

export class BackfillEventsDataCmd {
  _argv?: Arguments;
  _baseCmd: BaseCmd;

  constructor () {
    this._baseCmd = new BaseCmd();
  }

  get config (): Config {
    return this._baseCmd.config;
  }

  get database (): DatabaseInterface {
    return this._baseCmd.database;
  }

  async initConfig<ConfigType> (): Promise<ConfigType> {
    this._argv = this._getArgv();
    assert(this._argv);

    return this._baseCmd.initConfig(this._argv.configFile);
  }

  async init (
    Database: new (
      config: ConnectionOptions
    ) => DatabaseInterface
  ): Promise<void> {
    await this.initConfig();

    this._baseCmd._database = new Database(this.config.database);
    await this.database.init();
  }

  async exec (eventEntity: new () => EventInterface): Promise<void> {
    assert(this._argv);

    const eventRepository: Repository<EventInterface> = this.database._conn.getRepository(eventEntity);

    // Get the total count of events
    const totalEvents = await eventRepository.count();

    const batchSize = Number(this._argv.batchSize);
    let page = 0;
    let processedCount = 0;
    let eventsWithNullData: EventInterface[];

    while (processedCount < totalEvents) {
      // Fetch events in batches with pagination
      eventsWithNullData = await eventRepository.find({
        order: { id: 'ASC' },
        skip: page * batchSize,
        take: batchSize
      });

      for (const event of eventsWithNullData) {
        // Parse extra info and check if data field is present
        const parsedExtraInfo = JSON.parse(event.extraInfo);

        // Derive data and topics
        if (parsedExtraInfo.data) {
          event.data = parsedExtraInfo.data;
          [event.topic0, event.topic1, event.topic2, event.topic3] = parsedExtraInfo.topics;

          // Update extraInfo
          delete parsedExtraInfo.data;
          delete parsedExtraInfo.topics;

          event.extraInfo = JSONbigNative.stringify(parsedExtraInfo);
        }
      }

      // Save updated events
      await eventRepository.save(eventsWithNullData);

      // Update the processed count and progress
      processedCount += eventsWithNullData.length;
      const progress = ((processedCount / totalEvents) * 100).toFixed(2);
      log(`Processed ${processedCount}/${totalEvents} events (${progress}% complete)`);

      // Move to the next batch
      eventsWithNullData = [];
      page++;
    }

    log('Done.');
    await this.database.close();
  }

  _getArgv (): any {
    return yargs(hideBin(process.argv))
      .option('configFile', {
        alias: 'f',
        describe: 'configuration file path (toml)',
        type: 'string',
        default: DEFAULT_CONFIG_PATH
      })
      .option('b', {
        alias: 'batch-size',
        describe: 'batch size to process events in',
        type: 'number',
        default: 1000
      })
      .argv;
  }
}
