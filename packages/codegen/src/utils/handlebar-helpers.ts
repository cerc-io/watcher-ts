//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import Handlebars from 'handlebars';

export function registerHandlebarHelpers (): void {
  Handlebars.registerHelper('compare', compareHelper);
  Handlebars.registerHelper('capitalize', capitalizeHelper);
}

/**
 * Helper function to compare two values using the given operator.
 * @param lvalue Left hand side value.
 * @param rvalue Right hasd side value.
 * @param options Handlebars options parameter. `options.hash.operator`: operator to be used for comparison.
 * @returns Result of the comparison.
 */
function compareHelper (lvalue: string, rvalue: string, options: any): boolean {
  assert(lvalue && rvalue, "Handlerbars Helper 'compare' needs at least 2 parameters");

  const operator = options.hash.operator || '===';

  const operators: Map<string, (l:any, r:any) => boolean> = new Map();

  operators.set('===', function (l: any, r: any) { return l === r; });
  operators.set('!==', function (l: any, r: any) { return l !== r; });
  operators.set('<', function (l: any, r: any) { return l < r; });
  operators.set('>', function (l: any, r: any) { return l > r; });
  operators.set('<=', function (l: any, r: any) { return l <= r; });
  operators.set('>=', function (l: any, r: any) { return l >= r; });

  const operatorFunction = operators.get(operator);
  assert(operatorFunction, "Handlerbars Helper 'compare' doesn't know the operator " + operator);
  const result = operatorFunction(lvalue, rvalue);

  return result;
}

/**
 * Helper function that capitalized string till given index.
 * @param value String of which content is to be capitalized.
 * @param options Handlebars options parameter. `options.hash.tillIndex`: index till which to capitalize the string.
 * @returns The modified string.
 */
function capitalizeHelper (value: string, options: any): string {
  const tillIndex = options.hash.tillIndex || value.length;
  const result = `${value.slice(0, tillIndex).toUpperCase()}${value.slice(tillIndex, value.length)}`;

  return result;
}
