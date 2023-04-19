//
// Copyright 2021 Vulcanize, Inc.
//

import fs from 'fs';
import { Writable } from 'stream';

const isElementaryType = (typeName: any): boolean => (typeName.type === 'ElementaryTypeName');
export const isArrayType = (typeName: any): boolean => (typeName.type === 'ArrayTypeName');

export const getBaseType = (typeName: any): string | undefined => {
  if (isElementaryType(typeName)) {
    return typeName.name;
  } else if (isArrayType(typeName)) {
    return getBaseType(typeName.baseTypeName);
  } else {
    return undefined;
  }
};

export function writeFileToStream (pathToFile: string, outStream: Writable): void {
  const fileStream = fs.createReadStream(pathToFile);
  fileStream.pipe(outStream);
}
