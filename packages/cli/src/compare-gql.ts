import { request } from 'graphql-request';
import * as fs from 'fs';
import jsonDiff from 'json-diff';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import path from 'path';
import yaml from 'js-yaml';
import debug from 'debug';

const log = debug('vulcanize:compare-gql');
const SUBGRAPH_QUERY_FILEPATH = 'graphql/subgraph-query.graphql';
const NON_SUBGRAPH_QUERY_FILEPATH = 'graphql/non-subgraph-query.graphql';

function readFromJSONFile (filename: string): any {
  const fileContents = fs.readFileSync(filename, 'utf-8');
  if (fileContents !== '') {
    return JSON.parse(fileContents);
  }
}

function getQuery (isSubgraph: boolean, queryFilepath?: string): any {
  if (queryFilepath) {
    return fs.readFileSync(path.resolve(queryFilepath), 'utf-8');
  }

  if (isSubgraph) {
    return fs.readFileSync(SUBGRAPH_QUERY_FILEPATH, 'utf-8');
  }

  return fs.readFileSync(NON_SUBGRAPH_QUERY_FILEPATH, 'utf-8');
}

async function main (): Promise<void> {
  const argv = await yargs(hideBin(process.argv))
    .option('config', {
      alias: 'c',
      demandOption: true,
      describe: 'Watcher config file path (yaml)',
      type: 'string'
    }).argv;

  const configFilePath = path.resolve(argv.config);
  const inputConfig = yaml.load(fs.readFileSync(configFilePath, 'utf8')) as any;

  log('Config file:', inputConfig);

  const isSubgraph = inputConfig.isSubgraph;
  const watcherUrl = inputConfig.url;
  const gqlResultFilepath = path.resolve(inputConfig.gqlResultFilepath);
  const graphqlQueryFilepath = inputConfig.graphqlQuery;

  if (!fs.existsSync(gqlResultFilepath)) {
    fs.writeFileSync(gqlResultFilepath, '', 'utf-8');
  }

  const query = getQuery(isSubgraph, graphqlQueryFilepath);

  let gqlResponse;

  try {
    gqlResponse = await request(watcherUrl, query);
  } catch (err) {
    throw new Error('Error making GraphQL request:' + (err as Error).message);
  }

  const readOutputData = readFromJSONFile(gqlResultFilepath);

  if (readOutputData !== '') {
    const diff = jsonDiff.diffString(readOutputData, gqlResponse);

    if (diff !== '') {
      log('Showing diff', diff);
    } else {
      log('No diff detected, GQL response', gqlResponse);
    }
  } else {
    log('No diff detected, GQL response', gqlResponse);
  }

  fs.writeFileSync(gqlResultFilepath, JSON.stringify(gqlResponse, null, 2));
}

main().catch(err => {
  log(err);
});
