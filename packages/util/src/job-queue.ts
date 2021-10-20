//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import debug from 'debug';
import PgBoss from 'pg-boss';

interface Config {
  dbConnectionString: string
  maxCompletionLag: number
}

type JobCallback = (job: any) => Promise<void>;

const log = debug('vulcanize:job-queue');

export class JobQueue {
  _config: Config;
  _boss: PgBoss;

  constructor (config: Config) {
    this._config = config;
    this._boss = new PgBoss({
      // https://github.com/timgit/pg-boss/blob/master/docs/configuration.md

      connectionString: this._config.dbConnectionString,
      onComplete: true,

      // Num of retries with backoff
      retryLimit: 15,
      retryDelay: 1,
      retryBackoff: true,

      expireInHours: 24 * 7, // 7 days

      retentionDays: 30, // 30 days

      newJobCheckIntervalSeconds: 1
    });

    this._boss.on('error', error => log(error));
  }

  get maxCompletionLag (): number {
    return this._config.maxCompletionLag;
  }

  async start (): Promise<void> {
    await this._boss.start();
  }

  async subscribe (queue: string, callback: JobCallback): Promise<string> {
    return await this._boss.subscribe(queue, { teamSize: 1, teamConcurrency: 1 }, async (job: any) => {
      try {
        log(`Processing queue ${queue} job ${job.id}...`);
        await callback(job);
      } catch (error) {
        log(`Error in queue ${queue}`);
        log(error);
        throw error;
      }
    });
  }

  async onComplete (queue: string, callback: JobCallback): Promise<string> {
    return await this._boss.onComplete(queue, async (job: any) => {
      const { id, data: { failed, createdOn } } = job;
      log(`Job onComplete for queue ${queue} job ${id} created ${createdOn} success ${!failed}`);
      await callback(job);
    });
  }

  async markComplete (job: any): Promise<void> {
    this._boss.complete(job.id);
  }

  async pushJob (queue: string, job: any, options: PgBoss.PublishOptions = {}): Promise<void> {
    assert(this._boss);

    const jobId = await this._boss.publish(queue, job, options);
    log(`Created job in queue ${queue}: ${jobId}`);
  }

  async deleteAllJobs (): Promise<void> {
    await this._boss.deleteAllQueues();
  }
}
