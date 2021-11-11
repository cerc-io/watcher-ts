//
// Copyright 2021 Vulcanize, Inc.
//

const _solToTs: Map<string, string> = new Map();
const _tsToGql: Map<string, string> = new Map();
const _tsToPg: Map<string, string> = new Map();
const _gqlToTs: Map<string, string> = new Map();

// TODO Get typemapping from ethersjs.
// Solidity to Typescript type-mapping.
_solToTs.set('string', 'string');
_solToTs.set('uint8', 'number');
_solToTs.set('uint256', 'bigint');
_solToTs.set('address', 'string');
_solToTs.set('bool', 'boolean');
_solToTs.set('bytes4', 'string');

// Typescript to Graphql type-mapping.
_tsToGql.set('string', 'String');
_tsToGql.set('number', 'Int');
_tsToGql.set('bigint', 'BigInt');
_tsToGql.set('boolean', 'Boolean');

// Typescript to Postgres type-mapping.
_tsToPg.set('string', 'varchar');
_tsToPg.set('number', 'integer');
_tsToPg.set('bigint', 'bigint');
_tsToPg.set('boolean', 'boolean');

// Graphql to Typescript type-mapping.
_gqlToTs.set('String', 'string');
_gqlToTs.set('Int', 'number');
_gqlToTs.set('BigInt', 'bigint');
_gqlToTs.set('Boolean', 'boolean');

function getTsForSol (solType: string): string | undefined {
  return _solToTs.get(solType);
}

function getGqlForTs (tsType: string): string | undefined {
  return _tsToGql.get(tsType);
}

function getPgForTs (tsType: string): string | undefined {
  return _tsToPg.get(tsType);
}

function getTsForGql (gqlType: string): string | undefined {
  return _gqlToTs.get(gqlType);
}

export { getTsForSol, getGqlForTs, getPgForTs, getTsForGql };
