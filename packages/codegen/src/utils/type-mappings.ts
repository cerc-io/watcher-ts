//
// Copyright 2021 Vulcanize, Inc.
//

import { solToGql } from './solToGql';

const _tsToGql: Map<string, string> = new Map();
const _tsToPg: Map<string, string> = new Map();
const _gqlToTs: Map<string, string> = new Map();

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

function getGqlForSol (solType: string): string | undefined {
  return solToGql.get(solType);
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

export { getGqlForTs, getGqlForSol, getPgForTs, getTsForGql };
