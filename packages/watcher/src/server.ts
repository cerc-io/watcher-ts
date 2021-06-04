import assert from 'assert';
import express, { Application, Request, Response } from 'express';
import { graphqlHTTP } from 'express-graphql';
import fs from 'fs-extra';
import path from 'path';
import toml from 'toml';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import debug from 'debug';

import { createSchema } from './gql';

const log = debug('vulcanize:server');

export const createServer = async (): Promise<Application> => {
  const argv = await yargs(hideBin(process.argv))
    .option('f', {
      alias: 'config-file',
      demandOption: true,
      describe: 'configuration file path (toml)',
      type: 'string'
    })
    .argv;

  const configFile = argv.f;
  const configFilePath = path.resolve(configFile);
  const fileExists = await fs.pathExists(configFilePath);
  if (!fileExists) {
    throw new Error(`Config file not found: ${configFilePath}`);
  }

  const config = toml.parse(await fs.readFile(configFilePath, 'utf8'));
  log('config', JSON.stringify(config, null, 2));

  assert(config.server, 'Missing server config');

  const { host, port } = config.server;

  const app: Application = express();

  const schema = await createSchema(config);

  app.use(
    '/graphql',
    graphqlHTTP({
      schema,
      graphiql: true
    })
  );

  app.get('/', (req: Request, res: Response) => {
    res.send('ERC20 Watcher');
  });

  app.listen(port, host, () => {
    log(`Server is listening on host ${host} port ${port}`);
  });

  return app;
};

createServer().then(() => {
  log('Starting server...');
}).catch(err => {
  log(err);
});
