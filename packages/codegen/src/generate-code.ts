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
import os from 'os';

import { flatten } from '@poanet/solidity-flattener';
import { parse, visit } from '@solidity-parser/parser';
import { ASTNode } from '@solidity-parser/parser/dist/src/ast-types';
import { KIND_ACTIVE, KIND_LAZY } from '@cerc-io/util';

import { MODE_ETH_CALL, MODE_STORAGE, MODE_ALL, MODE_NONE, DEFAULT_PORT, ASSET_DIR } from './utils/constants';
import { Visitor } from './visitor';
import { exportServer } from './server';
import { exportConfig } from './config';
import { generateArtifacts } from './artifacts';
import { exportPackage } from './package';
import { exportTSConfig } from './tsconfig';
import { exportReadme } from './readme';
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
import { buildSubgraph, getSubgraphConfig } from './utils/subgraph';
import { exportIndexBlock } from './index-block';
import { exportSubscriber } from './subscriber';
import { exportReset } from './reset';
import { filterInheritedContractNodes, writeFileToStream } from './utils/helpers';

const main = async (): Promise<void> => {
  const argv = await yargs(hideBin(process.argv))
    .option('config-file', {
      alias: 'c',
      demandOption: true,
      describe: 'Watcher generation config file path (yaml)',
      type: 'string'
    })
    .option('continue-on-error', {
      alias: 'e',
      demandOption: false,
      default: false,
      describe: 'Continue generating watcher if unhandled types encountered',
      type: 'boolean'
    })
    .option('overwrite', {
      alias: 'o',
      demandOption: false,
      default: false,
      describe: 'Overwrite previously generated watcher',
      type: 'boolean'
    })
    .argv;

  const configFile = path.resolve(argv['config-file']);
  const config = await getConfig(configFile);

  // Create an array of flattened contract strings.
  const contracts: any[] = [];

  for (const contract of config.contracts) {
    const { path: inputFile, abiPath, name, kind } = contract;

    const contractData: any = {
      contractName: name,
      contractKind: kind
    };

    if (abiPath) {
      const abiString = fs.readFileSync(path.resolve(abiPath)).toString();
      contractData.contractAbi = JSON.parse(abiString);
    }

    if (inputFile) {
      assert(typeof inputFile === 'string', 'Contract input file path should be a string');

      if (inputFile.startsWith('http')) {
        // Assume flattened file in case of URL.
        const response = await fetch(inputFile);
        contractData.contractString = await response.text();
      } else {
        contractData.contractString = config.flatten
          ? await flatten(path.resolve(inputFile))
          : fs.readFileSync(path.resolve(inputFile)).toString();
      }

      // Generate artifacts from contract.
      const inputFileName = path.basename(inputFile, '.sol');

      const { abi, storageLayout } = await generateArtifacts(
        contractData.contractString,
        `${inputFileName}.sol`,
        contractData.contractName,
        config.solc
      );

      contractData.contractAbi = abi;
      contractData.contractStorageLayout = storageLayout;
    }

    contracts.push(contractData);
  }

  const continueOnError = argv['continue-on-error'];
  const overwriteExisting = argv.overwrite;

  const visitor = new Visitor(continueOnError);

  parseAndVisit(visitor, contracts, config.mode);

  generateWatcher(visitor, contracts, configFile, config, overwriteExisting);
};

function parseAndVisit (visitor: Visitor, contracts: any[], mode: string) {
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
    visitor.setContract(contract.contractName, contract.contractKind);
    visitor.parseEvents(contract.contractAbi);

    if (contract.contractString) {
      // Get the abstract syntax tree for the flattened contract.
      const ast = parse(contract.contractString);

      const contractNode = ast.children.find((node: ASTNode) =>
        node.type === 'ContractDefinition' &&
        node.name === contract.contractName
      );

      assert(contractNode);
      const nodes = filterInheritedContractNodes(ast, [contractNode]);
      ast.children = Array.from(nodes).concat(contractNode);

      visit(ast, {
        StateVariableDeclaration: stateVariableDeclarationVisitor,
        FunctionDefinition: functionDefinitionVisitor
      });
    }
  }
}

function generateWatcher (visitor: Visitor, contracts: any[], configFile: string, config: any, overWriteExisting = false) {
  // Prepare directory structure for the watcher.
  let outputDir = '';

  if (config.outputFolder) {
    outputDir = path.resolve(config.outputFolder);

    if (fs.existsSync(outputDir)) {
      if (!overWriteExisting) {
        throw new Error('Watcher already exists in output folder. Run with --overwrite flag to overwrite');
      }
    } else {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const huskyDir = path.join(outputDir, '.husky');
    if (!fs.existsSync(huskyDir)) fs.mkdirSync(huskyDir);

    const environmentsFolder = path.join(outputDir, 'environments');
    if (!fs.existsSync(environmentsFolder)) fs.mkdirSync(environmentsFolder);

    const artifactsFolder = path.join(outputDir, 'src/artifacts');
    if (!fs.existsSync(artifactsFolder)) fs.mkdirSync(artifactsFolder, { recursive: true });

    const entitiesFolder = path.join(outputDir, 'src/entity');
    if (!fs.existsSync(entitiesFolder)) fs.mkdirSync(entitiesFolder, { recursive: true });

    const resetCmdsFolder = path.join(outputDir, 'src/cli/reset-cmds');
    if (!fs.existsSync(resetCmdsFolder)) fs.mkdirSync(resetCmdsFolder, { recursive: true });

    const checkpointCmdsFolder = path.join(outputDir, 'src/cli/checkpoint-cmds');
    if (!fs.existsSync(checkpointCmdsFolder)) fs.mkdirSync(checkpointCmdsFolder, { recursive: true });
  }

  let outStream: Writable;

  // Export the codegen config file
  const configFileContent = fs.readFileSync(configFile, 'utf8');
  outStream = outputDir
    ? fs.createWriteStream(path.join(outputDir, 'codegen-config.yml'))
    : process.stdout;
  outStream.write(configFileContent);

  // Export artifacts for the contracts.
  contracts.forEach((contract: any) => {
    outStream = outputDir
      ? fs.createWriteStream(path.join(outputDir, 'src/artifacts/', `${contract.contractName}.json`))
      : process.stdout;

    outStream.write(JSON.stringify({ abi: contract.contractAbi, storageLayout: contract.contractStorageLayout }, null, 2));
  });

  // Register the handlebar helpers to be used in the templates.
  registerHandlebarHelpers(config);

  visitor.visitSubgraph(config.subgraphPath, config.subgraphConfig);

  if (config.subgraphPath && outputDir) {
    // Copy over the subgraph build to generated watcher
    fs.cpSync(config.subgraphPath, path.join(outputDir, 'subgraph-build'), { recursive: true });
  }

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
  visitor.exportIndexer(outStream, contracts);

  outStream = outputDir
    ? fs.createWriteStream(path.join(outputDir, 'src/server.ts'))
    : process.stdout;
  exportServer(outStream);

  outStream = outputDir
    ? fs.createWriteStream(path.join(outputDir, 'environments/local.toml'))
    : process.stdout;
  exportConfig(config.kind, config.port, path.basename(outputDir), outStream);

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
  visitor.exportEntities(entityDir, config.subgraphPath);

  outStream = outputDir
    ? fs.createWriteStream(path.join(outputDir, 'README.md'))
    : process.stdout;
  exportReadme(path.basename(outputDir), config, outStream);

  outStream = outputDir
    ? fs.createWriteStream(path.join(outputDir, 'LICENSE'))
    : process.stdout;
  writeFileToStream(path.join(ASSET_DIR, 'LICENSE'), outStream);

  outStream = outputDir
    ? fs.createWriteStream(path.join(outputDir, '.gitignore'))
    : process.stdout;
  writeFileToStream(path.join(ASSET_DIR, '.gitignore'), outStream);

  outStream = outputDir
    ? fs.createWriteStream(path.join(outputDir, '.npmrc'))
    : process.stdout;
  writeFileToStream(path.join(ASSET_DIR, '.npmrc'), outStream);

  const huskyPreCommitFilePath = path.join(outputDir, '.husky/pre-commit');

  outStream = outputDir
    ? fs.createWriteStream(huskyPreCommitFilePath)
    : process.stdout;
  writeFileToStream(path.join(ASSET_DIR, 'pre-commit'), outStream);

  if (fs.existsSync(huskyPreCommitFilePath)) {
    // Set file permission to executable
    fs.chmodSync(huskyPreCommitFilePath, '775');
  }

  outStream = outputDir
    ? fs.createWriteStream(path.join(outputDir, 'src/job-runner.ts'))
    : process.stdout;
  exportJobRunner(outStream);

  outStream = outputDir
    ? fs.createWriteStream(path.join(outputDir, 'src/cli/watch-contract.ts'))
    : process.stdout;
  exportWatchContract(outStream);

  const resetOutStream = fs.createWriteStream(path.join(outputDir, 'src/cli/reset.ts'));
  const resetJQOutStream = fs.createWriteStream(path.join(outputDir, 'src/cli/reset-cmds/job-queue.ts'));
  const resetWatcherOutStream = fs.createWriteStream(path.join(outputDir, 'src/cli/reset-cmds/watcher.ts'));
  const resetStateOutStream = fs.createWriteStream(path.join(outputDir, 'src/cli/reset-cmds/state.ts'));

  exportReset(resetOutStream, resetJQOutStream, resetWatcherOutStream, resetStateOutStream);

  let checkpointOutStream, checkpointCreateOutStream, checkpointVerifyOutStream;

  if (outputDir) {
    checkpointOutStream = fs.createWriteStream(path.join(outputDir, 'src/cli/checkpoint.ts'));
    checkpointCreateOutStream = fs.createWriteStream(path.join(outputDir, 'src/cli/checkpoint-cmds/create.ts'));
    if (config.subgraphPath) {
      checkpointVerifyOutStream = fs.createWriteStream(path.join(outputDir, 'src/cli/checkpoint-cmds/verify.ts'));
    }
  } else {
    checkpointOutStream = process.stdout;
    checkpointCreateOutStream = process.stdout;
    if (config.subgraphPath) {
      checkpointVerifyOutStream = process.stdout;
    }
  }

  exportCheckpoint(checkpointOutStream, checkpointCreateOutStream, checkpointVerifyOutStream);

  outStream = outputDir
    ? fs.createWriteStream(path.join(outputDir, 'src/hooks.ts'))
    : process.stdout;
  exportHooks(outStream);

  const fillOutStream = outputDir
    ? fs.createWriteStream(path.join(outputDir, 'src/fill.ts'))
    : process.stdout;
  exportFill(fillOutStream);

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

  outStream = outputDir
    ? fs.createWriteStream(path.join(outputDir, 'src/cli/index-block.ts'))
    : process.stdout;
  exportIndexBlock(outStream);

  if (config.subgraphPath) {
    outStream = outputDir
      ? fs.createWriteStream(path.join(outputDir, 'src/entity/Subscriber.ts'))
      : process.stdout;
    exportSubscriber(outStream);
  }
}

async function getConfig (configFile: string): Promise<any> {
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

  // Resolve paths.
  const contracts = inputConfig.contracts.map((contract: any) => {
    contract.path = contract.path.replace(/^~/, os.homedir());
    return contract;
  });

  let subgraphPath: string | undefined;
  let subgraphConfig;

  if (inputConfig.subgraph) {
    if (inputConfig.subgraph.directory) {
      await buildSubgraph(configFile, inputConfig.subgraph);
      subgraphPath = path.resolve(inputConfig.subgraph.directory, 'build');
    }

    if (inputConfig.subgraph.buildPath) {
      // Resolve path.
      subgraphPath = inputConfig.subgraph.buildPath.replace(/^~/, os.homedir()) as string;
    }

    assert(subgraphPath, 'Config subgraph.directory or subgraph.buildPath must be specified');
    subgraphConfig = getSubgraphConfig(subgraphPath);

    // Add contracts missing for dataSources and templates in subgraph config.
    subgraphConfig.dataSources
      .concat(subgraphConfig.templates ?? [])
      .forEach((dataSource: any) => {
        if (!contracts.some((contract: any) => contract.kind === dataSource.name)) {
          const abi = dataSource.mapping.abis.find((abi: any) => abi.name === dataSource.source.abi);
          assert(subgraphPath);
          const abiPath = path.resolve(subgraphPath, abi.file);

          contracts.push({
            name: dataSource.name,
            kind: dataSource.name,
            abiPath
          });
        }
      });
  }

  const inputFlatten = inputConfig.flatten;
  const flatten = (inputFlatten === undefined || inputFlatten === null) ? true : inputFlatten;

  return {
    contracts,
    outputFolder: inputConfig.outputFolder,
    mode: inputConfig.mode || MODE_ALL,
    kind: inputConfig.kind || KIND_ACTIVE,
    port: inputConfig.port || DEFAULT_PORT,
    solc: inputConfig.solc,
    flatten,
    subgraphPath,
    subgraphConfig
  };
}

main().catch(err => {
  console.error(err);
});
