import { request } from 'graphql-request';
import * as fs from 'fs';
import jsonDiff from 'json-diff';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import path from 'path';
import yaml from 'js-yaml';
import debug from 'debug';

const SUBGRAPH_QUERY_FILEPATH = 'graphql/subgraph-query.graphql';
const NON_SUBGRAPH_QUERY_FILEPATH = 'graphql/non-subgraph-query.graphql';

const log = debug('vulcanize:compare-gql');

function readFromJSONFile (filename: string): {[key: string]: any} | null {
  const fileContents = fs.readFileSync(filename, 'utf-8');

  if (fileContents !== '') {
    return JSON.parse(fileContents);
  }

  return null;
}

function getQuery (isSubgraph: boolean, queryFilepath?: string): any {
  if (queryFilepath) {
    return fs.readFileSync(queryFilepath, 'utf-8');
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

  log('Config:', inputConfig);

  const isSubgraph = inputConfig.isSubgraph;
  const watcherUrl = inputConfig.url;
  const configFileDirectory = path.dirname(configFilePath);
  const gqlResultFilepath = path.resolve(configFileDirectory, inputConfig.gqlResultFilepath);
  const graphqlQueryFilepath = inputConfig.graphqlQuery ? path.resolve(configFileDirectory, inputConfig.graphqlQuery) : undefined;

  if (!fs.existsSync(gqlResultFilepath)) {
    fs.writeFileSync(gqlResultFilepath, '', 'utf-8');
  }

  const query = getQuery(isSubgraph, graphqlQueryFilepath);

  let gqlResponse;

  try {
    gqlResponse = await request(watcherUrl, query);
  } catch (err) {
    throw new Error('Error in GQL request: ' + (err as Error).message);
  }

  const readOutputData = readFromJSONFile(gqlResultFilepath);

  if (readOutputData !== null) {
    const diff = jsonDiff.diffString(readOutputData, gqlResponse);

    if (diff !== '') {
      log('Diff detected', diff);
    } else {
      log('No diff detected, GQL response', gqlResponse);
    }
  } else {
    log('Fetching response for the first time, re run CLI to compare with latest GQL response');
  }

  fs.writeFileSync(gqlResultFilepath, JSON.stringify(gqlResponse, null, 2));
}

main().catch(err => {
  log(err);
});
