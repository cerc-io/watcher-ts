//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import debug from 'debug';
import PgBoss from 'pg-boss';

import { jobCount, lastJobCompletedOn } from './metrics';

interface Config {
  dbConnectionString: string
  maxCompletionLag: number
}

type JobCallback = (job: PgBoss.JobWithDoneCallback<any, any>) => Promise<void>;

const JOBS_PER_INTERVAL = 5;

const log = debug('vulcanize:job-queue');

export class JobQueue {
  _config: Config;
  _boss: PgBoss;

  constructor (config: Config) {
    this._config = config;
    this._boss = new PgBoss({
      // https://github.com/timgit/pg-boss/blob/6.1.0/docs/configuration.md

      connectionString: this._config.dbConnectionString,
      onComplete: true,

      // Num of retries with backoff
      retryLimit: 15,
      retryDelay: 1,
      retryBackoff: true,

      // Time before active job fails by expiration.
      expireInHours: 24 * 1, // 1 day

      retentionDays: 1, // 1 day

      deleteAfterHours: 1, // 1 hour

      newJobCheckInterval: 100,

      // Time interval for firing monitor-states event.
      monitorStateIntervalSeconds: 10
    });

    this._boss.on('error', error => log(error));

    this._boss.on('monitor-states', monitorStates => {
      jobCount.set({ state: 'all' }, monitorStates.all);
      jobCount.set({ state: 'created' }, monitorStates.created);
      jobCount.set({ state: 'retry' }, monitorStates.retry);
      jobCount.set({ state: 'active' }, monitorStates.active);
      jobCount.set({ state: 'completed' }, monitorStates.completed);
      jobCount.set({ state: 'expired' }, monitorStates.expired);
      jobCount.set({ state: 'cancelled' }, monitorStates.cancelled);
      jobCount.set({ state: 'failed' }, monitorStates.failed);

      Object.entries(monitorStates.queues).forEach(([name, counts]) => {
        jobCount.set({ state: 'all', name }, counts.all);
        jobCount.set({ state: 'created', name }, counts.created);
        jobCount.set({ state: 'retry', name }, counts.retry);
        jobCount.set({ state: 'active', name }, counts.active);
        jobCount.set({ state: 'completed', name }, counts.completed);
        jobCount.set({ state: 'expired', name }, counts.expired);
        jobCount.set({ state: 'cancelled', name }, counts.cancelled);
        jobCount.set({ state: 'failed', name }, counts.failed);
      });
    });
  }

  get maxCompletionLag (): number {
    return this._config.maxCompletionLag;
  }

  async start (): Promise<void> {
    await this._boss.start();
  }

  async stop (): Promise<void> {
    await this._boss.stop();
  }

  async subscribe (queue: string, callback: JobCallback): Promise<string> {
    return await this._boss.subscribe(
      queue,
      {
        teamSize: JOBS_PER_INTERVAL,
        teamConcurrency: 1
      },
      async (job) => {
        try {
          log(`Processing queue ${queue} job ${job.id}...`);
          await callback(job);
          lastJobCompletedOn.setToCurrentTime({ name: queue });
        } catch (error) {
          log(`Error in queue ${queue} job ${job.id}`);
          log(error);
          throw error;
        }
      }
    );
  }

  async onComplete (queue: string, callback: JobCallback): Promise<string> {
    return await this._boss.onComplete(
      queue,
      {
        teamSize: JOBS_PER_INTERVAL,
        teamConcurrency: 1
      },
      async (job: PgBoss.JobWithDoneCallback<any, any>) => {
        try {
          const { id, data: { failed, createdOn } } = job;
          log(`Job onComplete for queue ${queue} job ${id} created ${createdOn} success ${!failed}`);
          await callback(job);
        } catch (error) {
          log(`Error in onComplete handler for ${queue} job ${job.id}`);
          log(error);
          throw error;
        }
      }
    );
  }

  async markComplete (job: PgBoss.Job, data: object = {}): Promise<void> {
    await this._boss.complete(job.id, data);
  }

  async pushJob (queue: string, job: any, options: PgBoss.PublishOptions = {}): Promise<void> {
    assert(this._boss);

    const jobId = await this._boss.publish(queue, job, options);
    log(`Created job in queue ${queue}: ${jobId}`);
  }

  async deleteAllJobs (before: PgBoss.Subscription['state'] = 'active'): Promise<void> {
    // Workaround for incorrect type of pg-boss deleteAllQueues method
    const deleteAllQueues = this._boss.deleteAllQueues.bind(this._boss) as (options: { before: PgBoss.Subscription['state'] }) => Promise<void>;
    await deleteAllQueues({ before });
  }

  async deleteJobs (name: string, before: PgBoss.Subscription['state'] = 'active'): Promise<void> {
    // Workaround for incorrect type of pg-boss deleteAllQueues method
    const deleteQueue = this._boss.deleteQueue.bind(this._boss) as (name: string, options: { before: PgBoss.Subscription['state'] }) => Promise<void>;
    await deleteQueue(name, { before });
  }

  async getQueueSize (name: string, before: PgBoss.Subscription['state'] = 'active'): Promise<number> {
    return this._boss.getQueueSize(name, { before });
  }
}
