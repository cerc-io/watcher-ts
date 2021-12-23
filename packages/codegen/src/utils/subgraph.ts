import path from 'path';
import assert from 'assert';
import fs from 'fs';
import yaml from 'js-yaml';

import { loadFilesSync } from '@graphql-tools/load-files';

export function parseSubgraphSchema (subgraphPath: string): any {
  const subgraphSchemaPath = path.join(path.resolve(subgraphPath), '/schema.graphql');

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

export function getContractKindList (subgraphPath: string): string[] {
  const subgraphConfigPath = path.join(path.resolve(subgraphPath), '/subgraph.yaml');

  assert(fs.existsSync(subgraphConfigPath), `Subgraph config file not found at ${subgraphConfigPath}`);
  const subgraph = yaml.load(fs.readFileSync(subgraphConfigPath, 'utf8')) as any;

  const contractKinds: string[] = subgraph.dataSources.map((dataSource: any) => {
    return dataSource.name;
  });

  return contractKinds;
}

function parseType (typeNode: any): any {
  // Check if 'NamedType' is reached.
  if (typeNode.kind !== 'NamedType') {
    typeNode.type = parseType(typeNode.type);
  }

  return typeNode;
}
