//
// Copyright 2021 Vulcanize, Inc.
//

import fs from 'fs';
import fetch from 'node-fetch';
import path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { flatten } from '@poanet/solidity-flattener';

import { parse, visit } from '@solidity-parser/parser';

import { MODE_ETH_CALL, MODE_STORAGE, MODE_ALL } from './utils/constants';
import { Visitor } from './visitor';
import { exportServer } from './server';
import { exportConfig } from './config';
import { exportArtifacts } from './artifacts';
import { exportPackage } from './package';
import { exportTSConfig } from './tsconfig';
import { exportReadme } from './readme';
import { exportEvents } from './events';
import { registerHandlebarHelpers } from './utils/handlebar-helpers';

const main = async (): Promise<void> => {
  const argv = await yargs(hideBin(process.argv))
    .option('input-file', {
      alias: 'i',
      demandOption: true,
      describe: 'Input contract file path or an url.',
      type: 'string'
    })
    .option('contract-name', {
      alias: 'c',
      demandOption: true,
      describe: 'Main contract name.',
      type: 'string'
    })
    .option('output-folder', {
      alias: 'o',
      describe: 'Output folder path.',
      type: 'string'
    })
    .option('mode', {
      alias: 'm',
      describe: 'Code generation mode.',
      type: 'string',
      default: MODE_ALL,
      choices: [MODE_ETH_CALL, MODE_STORAGE, MODE_ALL]
    })
    .option('flatten', {
      alias: 'f',
      describe: 'Flatten the input contract file.',
      type: 'boolean',
      default: true
    })
    .argv;

  let data: string;
  if (argv['input-file'].startsWith('http')) {
    // Assume flattened file in case of URL.
    const response = await fetch(argv['input-file']);
    data = await response.text();
  } else {
    data = argv.flatten
      ? await flatten(path.resolve(argv['input-file']))
      : fs.readFileSync(path.resolve(argv['input-file'])).toString();
  }

  const visitor = new Visitor();

  parseAndVisit(data, visitor, argv.mode);

  generateWatcher(data, visitor, argv);
};

function parseAndVisit (data: string, visitor: Visitor, mode: string) {
  // Get the abstract syntax tree for the flattened contract.
  const ast = parse(data);

  // Filter out library nodes.
  ast.children = ast.children.filter(child => !(child.type === 'ContractDefinition' && child.kind === 'library'));

  if ([MODE_ALL, MODE_ETH_CALL].some(value => value === mode)) {
    visit(ast, {
      FunctionDefinition: visitor.functionDefinitionVisitor.bind(visitor),
      EventDefinition: visitor.eventDefinitionVisitor.bind(visitor)
    });
  }

  if ([MODE_ALL, MODE_STORAGE].some(value => value === mode)) {
    visit(ast, {
      StateVariableDeclaration: visitor.stateVariableDeclarationVisitor.bind(visitor),
      EventDefinition: visitor.eventDefinitionVisitor.bind(visitor)
    });
  }
}

function generateWatcher (data: string, visitor: Visitor, argv: any) {
  // Prepare directory structure for the watcher.
  let outputDir = '';
  if (argv['output-folder']) {
    outputDir = path.resolve(argv['output-folder']);
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const environmentsFolder = path.join(outputDir, 'environments');
    if (!fs.existsSync(environmentsFolder)) fs.mkdirSync(environmentsFolder);

    const artifactsFolder = path.join(outputDir, 'src/artifacts');
    if (!fs.existsSync(artifactsFolder)) fs.mkdirSync(artifactsFolder, { recursive: true });

    const entitiesFolder = path.join(outputDir, 'src/entity');
    if (!fs.existsSync(entitiesFolder)) fs.mkdirSync(entitiesFolder, { recursive: true });
  }

  const inputFileName = path.basename(argv['input-file'], '.sol');

  registerHandlebarHelpers();

  let outStream = outputDir
    ? fs.createWriteStream(path.join(outputDir, 'src/schema.gql'))
    : process.stdout;
  visitor.exportSchema(outStream);

  outStream = outputDir
    ? fs.createWriteStream(path.join(outputDir, 'src/resolvers.ts'))
    : process.stdout;
  visitor.exportResolvers(outStream);

  outStream = outputDir
    ? fs.createWriteStream(path.join(outputDir, 'src/indexer.ts'))
    : process.stdout;
  visitor.exportIndexer(outStream, inputFileName);

  outStream = outputDir
    ? fs.createWriteStream(path.join(outputDir, 'src/server.ts'))
    : process.stdout;
  exportServer(outStream);

  outStream = outputDir
    ? fs.createWriteStream(path.join(outputDir, 'environments/local.toml'))
    : process.stdout;
  exportConfig(path.basename(outputDir), outStream);

  outStream = outputDir
    ? fs.createWriteStream(path.join(outputDir, 'src/artifacts/', `${inputFileName}.json`))
    : process.stdout;
  exportArtifacts(
    outStream,
    data,
    `${inputFileName}.sol`,
    argv['contract-name']
  );

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
  exportReadme(path.basename(outputDir), argv['contract-name'], outStream);

  outStream = outputDir
    ? fs.createWriteStream(path.join(outputDir, 'src/events.ts'))
    : process.stdout;
  exportEvents(outStream);
}

main().catch(err => {
  console.error(err);
});
