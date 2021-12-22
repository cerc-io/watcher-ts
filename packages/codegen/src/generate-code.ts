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

import { flatten } from '@poanet/solidity-flattener';
import { parse, visit } from '@solidity-parser/parser';
import { KIND_ACTIVE, KIND_LAZY } from '@vulcanize/util';

import { MODE_ETH_CALL, MODE_STORAGE, MODE_ALL } from './utils/constants';
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

const main = async (): Promise<void> => {
  const argv = await yargs(hideBin(process.argv))
    .option('input-files', {
      alias: 'i',
      demandOption: true,
      describe: 'Input contract file path(s) or url(s).',
      type: 'array'
    })
    .option('contract-names', {
      alias: 'c',
      demandOption: true,
      describe: 'Contract name(s).',
      type: 'array'
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
    .option('kind', {
      alias: 'k',
      describe: 'Watcher kind.',
      type: 'string',
      default: KIND_ACTIVE,
      choices: [KIND_ACTIVE, KIND_LAZY]
    })
    .option('port', {
      alias: 'p',
      describe: 'Server port.',
      type: 'number',
      default: 3008
    })
    .option('flatten', {
      alias: 'f',
      describe: 'Flatten the input contract file.',
      type: 'boolean',
      default: true
    })
    .option('subgraph-path', {
      alias: 's',
      describe: 'Path to the subgraph build.',
      type: 'string'
    })
    .argv;

  // Create an array of flattened contract strings.
  const contractStrings: string[] = [];

  for (const inputFile of argv['input-files']) {
    assert(typeof inputFile === 'string', 'Input file path should be a string');

    if (inputFile.startsWith('http')) {
      // Assume flattened file in case of URL.
      const response = await fetch(inputFile);
      const contractString = await response.text();
      contractStrings.push(contractString);
    } else {
      contractStrings.push(argv.flatten
        ? await flatten(path.resolve(inputFile))
        : fs.readFileSync(path.resolve(inputFile)).toString()
      );
    }
  }

  const visitor = new Visitor();

  parseAndVisit(contractStrings, visitor, argv.mode);

  generateWatcher(contractStrings, visitor, argv);
};

function parseAndVisit (contractStrings: string[], visitor: Visitor, mode: string) {
  for (const contractString of contractStrings) {
    // Get the abstract syntax tree for the flattened contract.
    const ast = parse(contractString);

    // Filter out library nodes.
    ast.children = ast.children.filter(child => !(child.type === 'ContractDefinition' && child.kind === 'library'));

    if ([MODE_ALL, MODE_ETH_CALL].includes(mode)) {
      visit(ast, {
        FunctionDefinition: visitor.functionDefinitionVisitor.bind(visitor),
        EventDefinition: visitor.eventDefinitionVisitor.bind(visitor)
      });
    }

    if ([MODE_ALL, MODE_STORAGE].includes(mode)) {
      visit(ast, {
        StateVariableDeclaration: visitor.stateVariableDeclarationVisitor.bind(visitor),
        EventDefinition: visitor.eventDefinitionVisitor.bind(visitor)
      });
    }
  }
}

function generateWatcher (contractStrings: string[], visitor: Visitor, argv: any) {
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

    const resetCmdsFolder = path.join(outputDir, 'src/cli/reset-cmds');
    if (!fs.existsSync(resetCmdsFolder)) fs.mkdirSync(resetCmdsFolder, { recursive: true });
  }

  let outStream: Writable;

  const contractNames = argv['contract-names'];
  const inputFileNames: string[] = [];

  // Export artifacts for the contracts.
  argv['input-files'].forEach((inputFile: string, index: number) => {
    const inputFileName = path.basename(inputFile, '.sol');
    inputFileNames.push(inputFileName);

    outStream = outputDir
      ? fs.createWriteStream(path.join(outputDir, 'src/artifacts/', `${inputFileName}.json`))
      : process.stdout;

    exportArtifacts(
      outStream,
      contractStrings[index],
      `${inputFileName}.sol`,
      contractNames[index]
    );
  });

  // Register the handlebar helpers to be used in the templates.
  registerHandlebarHelpers();

  visitor.visitSubgraph(argv['subgraph-path']);

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
  visitor.exportIndexer(outStream, inputFileNames);

  outStream = outputDir
    ? fs.createWriteStream(path.join(outputDir, 'src/server.ts'))
    : process.stdout;
  exportServer(outStream);

  outStream = outputDir
    ? fs.createWriteStream(path.join(outputDir, 'environments/local.toml'))
    : process.stdout;
  exportConfig(argv.kind, argv.port, path.basename(outputDir), outStream, argv['subgraph-path']);

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

main().catch(err => {
  console.error(err);
});
