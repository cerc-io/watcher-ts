import path from 'path';
import assert from 'assert';
import fs from 'fs';

import { loadFilesSync } from '@graphql-tools/load-files';

const SCALAR_MAPPING: any = {
  BigDecimal: 'String',
  Bytes: 'String'
};

export function parseSubgraphSchema (subgraphPath: string): any {
  const subgraphSchemaPath = path.join(path.resolve(subgraphPath), '/schema.graphql');

  assert(fs.existsSync(subgraphSchemaPath));
  const typesArray = loadFilesSync(subgraphSchemaPath);

  // Get a subgraph-schema DocumentNode with existing types.
  const subgraphSchemaDocument = typesArray[0];
  const subgraphTypeDefs = subgraphSchemaDocument.definitions;

  subgraphTypeDefs.forEach((def: any) => {
    // Remove type directives.
    def.directives = [];

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

function parseType (typeNode: any): any {
  // Check if 'NamedType' is reached.
  if (typeNode.kind === 'NamedType') {
    const typeName: string = typeNode.name.value;

    // TODO Handle extra types provided by the graph.
    // Replace unknown scalars using SCALAR_MAPPING.
    if (typeName in SCALAR_MAPPING) {
      typeNode.name.value = SCALAR_MAPPING[typeName];
    }
  } else {
    typeNode.type = parseType(typeNode.type);
  }

  return typeNode;
}
