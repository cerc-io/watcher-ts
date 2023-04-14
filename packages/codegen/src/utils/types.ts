//
// Copyright 2021 Vulcanize, Inc.
//

export interface Param {
  name: string;
  type: string;
}

export const reservedNames = new Set([
  'Symbol'
]);

export const isElementaryType = (typeName: any): boolean => (typeName.type === 'ElementaryTypeName');
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
