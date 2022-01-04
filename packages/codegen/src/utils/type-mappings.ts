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
_solToTs.set('int24', 'number');
_solToTs.set('int256', 'bigint');
_solToTs.set('uint8', 'number');
_solToTs.set('uint16', 'number');
_solToTs.set('uint24', 'number');
_solToTs.set('uint64', 'bigint');
_solToTs.set('uint128', 'bigint');
_solToTs.set('uint160', 'bigint');
_solToTs.set('uint256', 'bigint');
_solToTs.set('uint', 'bigint');
_solToTs.set('address', 'string');
_solToTs.set('bool', 'boolean');
_solToTs.set('bytes', 'string');
_solToTs.set('bytes4', 'string');
_solToTs.set('bytes32', 'string');

// Typescript to Graphql type-mapping.
_tsToGql.set('string', 'String');
_tsToGql.set('number', 'Int');
_tsToGql.set('bigint', 'BigInt');
_tsToGql.set('boolean', 'Boolean');

// Typescript to Postgres type-mapping.
_tsToPg.set('string', 'varchar');
_tsToPg.set('number', 'integer');
_tsToPg.set('bigint', 'numeric');
_tsToPg.set('boolean', 'boolean');
_tsToPg.set('Decimal', 'numeric');

// Graphql to Typescript type-mapping.
_gqlToTs.set('String', 'string');
_gqlToTs.set('Int', 'number');
_gqlToTs.set('BigInt', 'bigint');
_gqlToTs.set('Boolean', 'boolean');
_gqlToTs.set('BigDecimal', 'Decimal');
_gqlToTs.set('Bytes', 'string');

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
