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
    this._boss = new PgBoss({ connectionString: this._config.dbConnectionString, onComplete: true });
    this._boss.on('error', error => log(error));
  }

  get maxCompletionLag (): number {
    return this._config.maxCompletionLag;
  }

  async start (): Promise<void> {
    await this._boss.start();
  }

  async subscribe (queue: string, callback: JobCallback): Promise<string> {
    return await this._boss.subscribe(queue, async (job: any) => {
      log(`Processing queue ${queue} job ${job.id}...`);
      await callback(job);
    });
  }

  async onComplete (queue: string, callback: JobCallback): Promise<string> {
    return await this._boss.onComplete(queue, async (job: any) => {
      log(`Job complete for queue ${queue} job ${job.id}...`);
      await callback(job);
    });
  }

  async markComplete (job: any): Promise<void> {
    this._boss.complete(job.id);
  }

  async pushJob (queue: string, job: any): Promise<void> {
    assert(this._boss);

    const jobId = await this._boss.publish(queue, job);
    log(`Created job in queue ${queue}: ${jobId}`);
  }
}
