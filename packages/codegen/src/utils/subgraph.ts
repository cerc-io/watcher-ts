import path from 'path';
import assert from 'assert';
import fs from 'fs';
import yaml from 'js-yaml';
import shell from 'shelljs';

import PackageJson from '@npmcli/package-json';
import { loadFilesSync } from '@graphql-tools/load-files';

import { ASSET_DIR } from './constants';

const GRAPH_TS_VERSION = '0.27.0-watcher-ts-0.1.3';
const GRAPH_CLI_VERSION = '0.32.0-watcher-ts-0.1.4';

export function parseSubgraphSchema (subgraphPath: string, subgraphConfig: any): any {
  const subgraphSchemaPath = path.join(path.resolve(subgraphPath), subgraphConfig.schema?.file ?? './schema.graphql');

  assert(fs.existsSync(subgraphSchemaPath), `Schema file not found at ${subgraphSchemaPath}`);
  const typesArray = loadFilesSync(subgraphSchemaPath);

  // Get a subgraph-schema DocumentNode with existing types.
  const subgraphSchemaDocument = typesArray[0];
  const subgraphTypeDefs = subgraphSchemaDocument.definitions;

  subgraphTypeDefs.forEach((def: any) => {
    if (def.kind === 'ObjectTypeDefinition') {
      def.fields.forEach((field: any) => {
        // Parse the field type.
        field.type = parseType(field.type);
      });
    }
  });

  subgraphSchemaDocument.definitions = subgraphTypeDefs;

  // Return a modified subgraph-schema DocumentNode.
  return subgraphSchemaDocument;
}

export function getFieldType (typeNode: any): { typeName: string, array: boolean, nullable: boolean } {
  if (typeNode.kind === 'ListType') {
    return { typeName: getFieldType(typeNode.type).typeName, array: true, nullable: true };
  }

  if (typeNode.kind === 'NonNullType') {
    const fieldType = getFieldType(typeNode.type);

    return { typeName: fieldType.typeName, array: fieldType.array, nullable: false };
  }

  // If 'NamedType'.
  return { typeName: typeNode.name.value, array: false, nullable: true };
}

export function getSubgraphConfig (subgraphPath: string): any {
  const subgraphConfigPath = path.join(path.resolve(subgraphPath), '/subgraph.yaml');

  assert(fs.existsSync(subgraphConfigPath), `Subgraph config file not found at ${subgraphConfigPath}`);
  return yaml.load(fs.readFileSync(subgraphConfigPath, 'utf8')) as any;
}

export async function buildSubgraph (
  codegenConfigPath: string,
  subgraphConfig: {
    directory: string,
    packageManager: string,
    configFile: string,
    networkFilePath?: string,
    network?: string
  }
): Promise<void> {
  const codegenConfigDirName = path.dirname(codegenConfigPath);
  const subgraphDirectory = path.resolve(codegenConfigDirName, subgraphConfig.directory);
  const codegenWorkingDir = process.cwd();
  // Change directory to subgraph repo
  shell.cd(subgraphDirectory);

  // Replace graph-cli & graph-ts in package.json with cerc-io forks
  const pkgJson = await PackageJson.load(subgraphDirectory);
  const { content } = pkgJson;

  if (content.dependencies) {
    // Remove graph tools from direct dependencies
    delete content.dependencies['@graphprotocol/graph-ts'];
    delete content.dependencies['@graphprotocol/graph-cli'];
  }

  if (!content.devDependencies) {
    content.devDependencies = {};
  }

  content.devDependencies['@graphprotocol/graph-ts'] = `npm:@cerc-io/graph-ts@${GRAPH_TS_VERSION}`;
  delete content.devDependencies['@graphprotocol/graph-cli'];
  content.devDependencies['@cerc-io/graph-cli'] = GRAPH_CLI_VERSION;
  pkgJson.update(content);
  await pkgJson.save();

  // Create .npmrc for cerc-io packages
  fs.copyFileSync(path.join(ASSET_DIR, '.npmrc'), path.join(subgraphDirectory, '.npmrc'));

  const packageManager = subgraphConfig.packageManager;
  // Install dependencies
  const { code: installCode } = shell.exec(`${packageManager} install --force`);
  assert(installCode === 0, 'Installing dependencies exited with error');

  const subgraphConfigPath = path.resolve(codegenConfigDirName, subgraphConfig.configFile);

  // Run graph-cli codegen
  const { code: codegenCode } = shell.exec(`${packageManager === 'npm' ? 'npx' : packageManager} graph codegen ${subgraphConfigPath}`);
  assert(codegenCode === 0, 'Subgraph codegen command exited with error');

  // Run graph-cli build
  let buildCommand = `${packageManager === 'npm' ? 'npx' : packageManager} graph build ${subgraphConfigPath}`;

  if (subgraphConfig.networkFilePath) {
    const subgraphNetworkFilePath = path.resolve(codegenConfigDirName, subgraphConfig.networkFilePath);
    assert(subgraphConfig.network, 'Config subgraph.network should be set if using networkFilePath');
    const subgraphNetwork = subgraphConfig.network;
    buildCommand = `${buildCommand} --network-file ${subgraphNetworkFilePath} --network ${subgraphNetwork}`;
  }

  const { code: buildCode } = shell.exec(buildCommand);
  assert(buildCode === 0, 'Subgraph build command exited with error');

  // Change directory back to codegen
  shell.cd(codegenWorkingDir);
}

function parseType (typeNode: any): any {
  // Check if 'NamedType' is reached.
  if (typeNode.kind !== 'NamedType') {
    typeNode.type = parseType(typeNode.type);
  }

  return typeNode;
}
