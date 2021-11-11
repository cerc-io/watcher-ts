import path from 'path';

import { loadFilesSync } from '@graphql-tools/load-files';

export function parseSubgraphSchema (schemaTypes: string[], schemaPath: string): any {
  const typesArray = loadFilesSync(path.resolve(schemaPath));

  // Get a subgraph-schema DocumentNode with existing types.
  const subgraphSchemaDocument = typesArray[0];
  let subgraphTypeDefs = subgraphSchemaDocument.definitions;

  // Remove duplicates.
  subgraphTypeDefs = subgraphTypeDefs.filter((def: any) => {
    return !schemaTypes.includes(def.name.value);
  });

  const subgraphTypes: string[] = subgraphTypeDefs.map((def: any) => {
    return def.name.value;
  });

  const defaultTypes = ['Int', 'Float', 'String', 'Boolean', 'ID'];

  const knownTypes = schemaTypes.concat(subgraphTypes, defaultTypes);

  subgraphTypeDefs.forEach((def: any) => {
    // Remove type directives.
    def.directives = [];

    if (def.kind === 'ObjectTypeDefinition') {
      def.fields.forEach((field: any) => {
        // Remove field directives.
        field.directives = [];

        // Parse the field type.
        field.type = parseType(knownTypes, field.type);
      });
    }
  });

  subgraphSchemaDocument.definitions = subgraphTypeDefs;

  // Return a modified subgraph-schema DocumentNode.
  return subgraphSchemaDocument;
}

function parseType (knownTypes: string[], typeNode: any): any {
  // Check if 'NamedType' is reached.
  if (typeNode.kind === 'NamedType') {
    const typeName = typeNode.name.value;

    // TODO Handle extra types provided by the graph.
    // Replace unknown types with 'String'.
    if (!knownTypes.includes(typeName)) {
      typeNode.name.value = 'String';
    }
  } else {
    typeNode.type = parseType(knownTypes, typeNode.type);
  }

  return typeNode;
}
