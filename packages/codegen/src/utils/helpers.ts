//
// Copyright 2021 Vulcanize, Inc.
//

import fs from 'fs';
import { Writable } from 'stream';

import { TypeName, ASTNode, InheritanceSpecifier, SourceUnit } from '@solidity-parser/parser/dist/src/ast-types';

export const isArrayType = (typeName: TypeName): boolean => (typeName.type === 'ArrayTypeName');

export const getBaseType = (typeName: TypeName): string | undefined => {
  if (typeName.type === 'ElementaryTypeName') {
    return typeName.name;
  } else if (typeName.type === 'ArrayTypeName') {
    return getBaseType(typeName.baseTypeName);
  } else {
    return undefined;
  }
};

export function writeFileToStream (pathToFile: string, outStream: Writable): void {
  const fileStream = fs.createReadStream(pathToFile);
  fileStream.pipe(outStream);
}

export function filterInheritedContractNodes (ast: SourceUnit, contractNodes: ASTNode[]): Set<ASTNode> {
  const resultSet: Set<ASTNode> = new Set();

  contractNodes.forEach((node: ASTNode) => {
    if (node.type !== 'ContractDefinition') return;
    resultSet.add(node);

    const inheritedContracts = ast.children.filter((childNode: ASTNode) =>
      childNode.type === 'ContractDefinition' &&
      childNode.kind !== 'library' &&
      node.baseContracts.some((baseContract: InheritanceSpecifier) =>
        baseContract.baseName.namePath === childNode.name
      )
    );

    const childInheritedNodes = filterInheritedContractNodes(ast, inheritedContracts);
    childInheritedNodes.forEach((node: ASTNode) => resultSet.add(node));
  });

  return resultSet;
}
