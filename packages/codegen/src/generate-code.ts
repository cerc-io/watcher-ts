//
// Copyright 2021 Vulcanize, Inc.
//

import fs from 'fs';
import fetch from 'node-fetch';
import path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import assert from 'assert';
import { Writable } from 'stream';
import yaml from 'js-yaml';

import { flatten } from '@poanet/solidity-flattener';
import { parse, visit } from '@solidity-parser/parser';
import { KIND_ACTIVE, KIND_LAZY } from '@vulcanize/util';

import { MODE_ETH_CALL, MODE_STORAGE, MODE_ALL, MODE_NONE, DEFAULT_PORT } from './utils/constants';
import { Visitor } from './visitor';
import { exportServer } from './server';
import { exportConfig } from './config';
import { exportArtifacts } from './artifacts';
import { exportPackage } from './package';
import { exportTSConfig } from './tsconfig';
import { exportReadme } from './readme';
import { exportEvents } from './events';
import { exportJobRunner } from './job-runner';
import { exportWatchContract } from './watch-contract';
import { exportLint } from './lint';
import { registerHandlebarHelpers } from './utils/handlebar-helpers';
import { exportHooks } from './hooks';
import { exportFill } from './fill';
import { exportCheckpoint } from './checkpoint';
import { exportState } from './export-state';
import { importState } from './import-state';
import { exportInspectCID } from './inspect-cid';
import { getContractKinds } from './utils/subgraph';

const main = async (): Promise<void> => {
  const argv = await yargs(hideBin(process.argv))
    .option('config-file', {
      alias: 'c',
      demandOption: true,
      describe: 'Watcher generation config file path (yaml)',
      type: 'string'
    })
    .argv;

  const config = getConfig(path.resolve(argv['config-file']));

  // Create an array of flattened contract strings.
  const contracts: any = [];

  for (const contract of config.contracts) {
    const inputFile = contract.path;
    assert(typeof inputFile === 'string', 'Contract input file path should be a string');

    let contractString;

    if (inputFile.startsWith('http')) {
      // Assume flattened file in case of URL.
      const response = await fetch(inputFile);
      contractString = await response.text();
    } else {
      contractString = config.flatten
        ? await flatten(path.resolve(inputFile))
        : fs.readFileSync(path.resolve(inputFile)).toString();
    }

    contracts.push({ contractString, contractName: contract.name, contractKind: contract.kind });
  }

  const visitor = new Visitor();

  parseAndVisit(visitor, contracts, config.mode);

  generateWatcher(visitor, contracts, config);
};

function parseAndVisit (visitor: Visitor, contracts: any[], mode: string) {
  const eventDefinitionVisitor = visitor.eventDefinitionVisitor.bind(visitor);
  let functionDefinitionVisitor;
  let stateVariableDeclarationVisitor;

  // Visit function definitions only if mode is MODE_ETH_CALL | MODE_ALL.
  if ([MODE_ALL, MODE_ETH_CALL].includes(mode)) {
    functionDefinitionVisitor = visitor.functionDefinitionVisitor.bind(visitor);
  }

  // Visit state variable declarations only if mode is MODE_STORAGE | MODE_ALL.
  if ([MODE_ALL, MODE_STORAGE].includes(mode)) {
    stateVariableDeclarationVisitor = visitor.stateVariableDeclarationVisitor.bind(visitor);
  }

  for (const contract of contracts) {
    // Get the abstract syntax tree for the flattened contract.
    const ast = parse(contract.contractString);

    // Filter out library nodes.
    ast.children = ast.children.filter(child => !(child.type === 'ContractDefinition' && child.kind === 'library'));

    visitor.setContract(contract.contractName, contract.contractKind);

    visit(ast, {
      FunctionDefinition: functionDefinitionVisitor,
      StateVariableDeclaration: stateVariableDeclarationVisitor,
      EventDefinition: eventDefinitionVisitor
    });
  }
}

function generateWatcher (visitor: Visitor, contracts: any[], config: any) {
  // Prepare directory structure for the watcher.
  let outputDir = '';
  if (config.outputFolder) {
    outputDir = path.resolve(config.outputFolder);
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const environmentsFolder = path.join(outputDir, 'environments');
    if (!fs.existsSync(environmentsFolder)) fs.mkdirSync(environmentsFolder);

    const artifactsFolder = path.join(outputDir, 'src/artifacts');
    if (!fs.existsSync(artifactsFolder)) fs.mkdirSync(artifactsFolder, { recursive: true });

    const entitiesFolder = path.join(outputDir, 'src/entity');
    if (!fs.existsSync(entitiesFolder)) fs.mkdirSync(entitiesFolder, { recursive: true });

    const resetCmdsFolder = path.join(outputDir, 'src/cli/reset-cmds');
    if (!fs.existsSync(resetCmdsFolder)) fs.mkdirSync(resetCmdsFolder, { recursive: true });
  }

  let outStream: Writable;

  // Export artifacts for the contracts.
  config.contracts.forEach((contract: any, index: number) => {
    const inputFileName = path.basename(contract.path, '.sol');

    outStream = outputDir
      ? fs.createWriteStream(path.join(outputDir, 'src/artifacts/', `${contract.name}.json`))
      : process.stdout;

    exportArtifacts(
      outStream,
      contracts[index].contractString,
      `${inputFileName}.sol`,
      contract.name
    );
  });

  // Register the handlebar helpers to be used in the templates.
  registerHandlebarHelpers();

  visitor.visitSubgraph(config.subgraphPath);

  outStream = outputDir
    ? fs.createWriteStream(path.join(outputDir, 'src/schema.gql'))
    : process.stdout;
  const schemaContent = visitor.exportSchema(outStream);

  outStream = outputDir
    ? fs.createWriteStream(path.join(outputDir, 'src/resolvers.ts'))
    : process.stdout;
  visitor.exportResolvers(outStream);

  outStream = outputDir
    ? fs.createWriteStream(path.join(outputDir, 'src/indexer.ts'))
    : process.stdout;
  visitor.exportIndexer(outStream, config.contracts);

  outStream = outputDir
    ? fs.createWriteStream(path.join(outputDir, 'src/server.ts'))
    : process.stdout;
  exportServer(outStream);

  outStream = outputDir
    ? fs.createWriteStream(path.join(outputDir, 'environments/local.toml'))
    : process.stdout;
  exportConfig(config.kind, config.port, path.basename(outputDir), outStream, config.subgraphPath);

  outStream = outputDir
    ? fs.createWriteStream(path.join(outputDir, 'src/database.ts'))
    : process.stdout;
  visitor.exportDatabase(outStream);

  outStream = outputDir
    ? fs.createWriteStream(path.join(outputDir, 'package.json'))
    : process.stdout;
  exportPackage(path.basename(outputDir), outStream);

  outStream = outputDir
    ? fs.createWriteStream(path.join(outputDir, 'tsconfig.json'))
    : process.stdout;
  exportTSConfig(outStream);

  const entityDir = outputDir
    ? path.join(outputDir, 'src/entity')
    : '';
  visitor.exportEntities(entityDir);

  outStream = outputDir
    ? fs.createWriteStream(path.join(outputDir, 'README.md'))
    : process.stdout;
  exportReadme(path.basename(outputDir), config.port, outStream);

  outStream = outputDir
    ? fs.createWriteStream(path.join(outputDir, 'src/events.ts'))
    : process.stdout;
  exportEvents(outStream);

  outStream = outputDir
    ? fs.createWriteStream(path.join(outputDir, 'src/job-runner.ts'))
    : process.stdout;
  exportJobRunner(outStream);

  outStream = outputDir
    ? fs.createWriteStream(path.join(outputDir, 'src/cli/watch-contract.ts'))
    : process.stdout;
  exportWatchContract(outStream);

  outStream = outputDir
    ? fs.createWriteStream(path.join(outputDir, 'src/cli/checkpoint.ts'))
    : process.stdout;
  exportCheckpoint(outStream);

  outStream = outputDir
    ? fs.createWriteStream(path.join(outputDir, 'src/hooks.ts'))
    : process.stdout;
  exportHooks(outStream);

  outStream = outputDir
    ? fs.createWriteStream(path.join(outputDir, 'src/fill.ts'))
    : process.stdout;
  exportFill(outStream);

  outStream = outputDir
    ? fs.createWriteStream(path.join(outputDir, 'src/types.ts'))
    : process.stdout;
  visitor.exportTypes(outStream);

  let rcOutStream, ignoreOutStream;

  if (outputDir) {
    rcOutStream = fs.createWriteStream(path.join(outputDir, '.eslintrc.json'));
    ignoreOutStream = fs.createWriteStream(path.join(outputDir, '.eslintignore'));
  } else {
    rcOutStream = process.stdout;
    ignoreOutStream = process.stdout;
  }

  exportLint(rcOutStream, ignoreOutStream);

  outStream = outputDir
    ? fs.createWriteStream(path.join(outputDir, 'src/client.ts'))
    : process.stdout;
  visitor.exportClient(outStream, schemaContent, path.join(outputDir, 'src/gql'));

  let resetOutStream, resetJQOutStream, resetStateOutStream;

  if (outputDir) {
    resetOutStream = fs.createWriteStream(path.join(outputDir, 'src/cli/reset.ts'));
    resetJQOutStream = fs.createWriteStream(path.join(outputDir, 'src/cli/reset-cmds/job-queue.ts'));
    resetStateOutStream = fs.createWriteStream(path.join(outputDir, 'src/cli/reset-cmds/state.ts'));
  } else {
    resetOutStream = process.stdout;
    resetJQOutStream = process.stdout;
    resetStateOutStream = process.stdout;
  }

  visitor.exportReset(resetOutStream, resetJQOutStream, resetStateOutStream);

  outStream = outputDir
    ? fs.createWriteStream(path.join(outputDir, 'src/cli/export-state.ts'))
    : process.stdout;
  exportState(outStream);

  outStream = outputDir
    ? fs.createWriteStream(path.join(outputDir, 'src/cli/import-state.ts'))
    : process.stdout;
  importState(outStream);

  outStream = outputDir
    ? fs.createWriteStream(path.join(outputDir, 'src/cli/inspect-cid.ts'))
    : process.stdout;
  exportInspectCID(outStream);
}

function getConfig (configFile: string): any {
  assert(fs.existsSync(configFile), `Config file not found at ${configFile}`);

  // Read config.
  const inputConfig = yaml.load(fs.readFileSync(configFile, 'utf8')) as any;

  // Run validations on config fields.
  if (inputConfig.mode) {
    assert([MODE_ETH_CALL, MODE_STORAGE, MODE_ALL, MODE_NONE].includes(inputConfig.mode), 'Invalid code generation mode');
  }

  if (inputConfig.kind) {
    assert([KIND_ACTIVE, KIND_LAZY].includes(inputConfig.kind), 'Invalid watcher kind');
  }

  if (inputConfig.port) {
    assert(typeof inputConfig.port === 'number', 'Invalid watcher server port');
  }

  // Check that every input contract kind is present in the subgraph config.
  if (inputConfig.subgraphPath) {
    const subgraphKinds: string[] = getContractKinds(inputConfig.subgraphPath);
    const inputKinds: string[] = inputConfig.contracts.map((contract: any) => contract.kind);

    assert(
      inputKinds.every((inputKind: string) => subgraphKinds.includes(inputKind)),
      'Input contract kind not available in the subgraph.'
    );
  }

  const inputFlatten = inputConfig.flatten;
  const flatten = (inputFlatten === undefined || inputFlatten === null) ? true : inputFlatten;

  return {
    contracts: inputConfig.contracts,
    outputFolder: inputConfig.outputFolder,
    mode: inputConfig.mode || MODE_ALL,
    kind: inputConfig.kind || KIND_ACTIVE,
    port: inputConfig.port || DEFAULT_PORT,
    flatten,
    subgraphPath: inputConfig.subgraphPath
  };
}

main().catch(err => {
  console.error(err);
});
