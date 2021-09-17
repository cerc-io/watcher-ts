//
// Copyright 2021 Vulcanize, Inc.
//

import { readFileSync, createWriteStream } from 'fs';
import fetch from 'node-fetch';
import path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { flatten } from '@poanet/solidity-flattener';

import { parse, visit } from '@solidity-parser/parser';

import { Visitor } from './visitor';

const MODE_ETH_CALL = 'eth_call';
const MODE_STORAGE = 'storage';

const main = async (): Promise<void> => {
  const argv = await yargs(hideBin(process.argv))
    .option('input-file', {
      alias: 'i',
      demandOption: true,
      describe: 'Input contract file path or an url.',
      type: 'string'
    })
    .option('output-file', {
      alias: 'o',
      describe: 'Schema output file path.',
      type: 'string'
    })
    .option('mode', {
      alias: 'm',
      describe: 'Code generation mode.',
      type: 'string',
      default: MODE_STORAGE,
      choices: [MODE_ETH_CALL, MODE_STORAGE]
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
      : readFileSync(path.resolve(argv['input-file'])).toString();
  }

  // Get the abstract syntax tree for the flattened contract.
  const ast = parse(data);

  // Filter out library nodes.
  ast.children = ast.children.filter(child => !(child.type === 'ContractDefinition' && child.kind === 'library'));

  const visitor = new Visitor();

  if (argv.mode === MODE_ETH_CALL) {
    visit(ast, {
      FunctionDefinition: visitor.functionDefinitionVisitor.bind(visitor),
      EventDefinition: visitor.eventDefinitionVisitor.bind(visitor)
    });
  } else {
    visit(ast, {
      StateVariableDeclaration: visitor.stateVariableDeclarationVisitor.bind(visitor),
      EventDefinition: visitor.eventDefinitionVisitor.bind(visitor)
    });
  }

  const outStream = argv['output-file']
    ? createWriteStream(path.resolve(argv['output-file']))
    : process.stdout;
  visitor.exportSchema(outStream);
};

main().catch(err => {
  console.error(err);
});
