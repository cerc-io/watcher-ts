import path from 'path';
import assert from 'assert';
import fs from 'fs';
import yaml from 'js-yaml';
import shell from 'shelljs';

import { loadFilesSync } from '@graphql-tools/load-files';

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

export function buildSubgraph (
  codegenConfigPath: string,
  subgraphConfig: {
    directory: string,
    configFile: string,
    networkFilePath?: string,
    network?: string
  }
): void {
  const subgraphDirectory = path.resolve(codegenConfigPath, subgraphConfig.directory);
  const subgraphConfigPath = path.resolve(codegenConfigPath, subgraphConfig.configFile);
  const codegenWorkingDir = process.cwd();
  // Change directory to subgraph repo
  shell.cd(subgraphDirectory);

  // TODO: Replace graph-cli & graph-ts in package.json with cerc-io forks

  // Run graph-cli codegen
  const { code } = shell.exec(`yarn graph codegen ${subgraphConfigPath}`);
  console.log('code', code);

  // TODO: Run graph-cli build

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
