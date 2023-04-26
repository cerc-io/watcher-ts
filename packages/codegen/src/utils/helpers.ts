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

/**
 * Get inherited contracts for array of contractNodes
 * @param ast
 * @param contractNodes
 */
export function filterInheritedContractNodes (ast: SourceUnit, contractNodes: ASTNode[]): Set<ASTNode> {
  const resultSet: Set<ASTNode> = new Set();

  contractNodes.forEach((node: ASTNode) => {
    if (node.type !== 'ContractDefinition') {
      return;
    }

    // Filter out library nodes
    if (node.kind === 'library') {
      return;
    }

    const inheritedContracts = ast.children.filter((childNode: ASTNode) =>
      node.baseContracts.some((baseContract: InheritanceSpecifier) =>
        childNode.type === 'ContractDefinition' && baseContract.baseName.namePath === childNode.name
      )
    );

    // Add inherited contracts to result set
    inheritedContracts.forEach((node: ASTNode) => resultSet.add(node));
    // Get parent inherited contracts
    const parentInheritedNodes = filterInheritedContractNodes(ast, inheritedContracts);
    // Add parent inherited contract nodes in result set
    parentInheritedNodes.forEach((node: ASTNode) => resultSet.add(node));
  });

  return resultSet;
}
