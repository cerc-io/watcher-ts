//
// Copyright 2021 Vulcanize, Inc.
//

import fs from 'fs';
import { Writable } from 'stream';
import { TypeName } from '@solidity-parser/parser/dist/src/ast-types';

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
