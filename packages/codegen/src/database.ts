//
// Copyright 2021 Vulcanize, Inc.
//

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import Handlebars from 'handlebars';
import { Writable } from 'stream';
import _ from 'lodash';

import { getTsForSol } from './utils/type-mappings';
import { Param } from './utils/types';

const TEMPLATE_FILE = './templates/database-template.handlebars';

export class Database {
  _queries: Array<any>;
  _templateString: string;

  constructor () {
    this._queries = [];
    this._templateString = fs.readFileSync(path.resolve(__dirname, TEMPLATE_FILE)).toString();
  }

  /**
   * Stores the query to be passed to the template.
   * @param name Name of the query.
   * @param params Parameters to the query.
   * @param returnType Return type for the query.
   */
  addQuery (name: string, params: Array<Param>, returnType: string): void {
    // Check if the query is already added.
    if (this._queries.some(query => query.name === name)) {
      return;
    }

    const queryObject = {
      name,
      entityName: '',
      getQueryName: '',
      saveQueryName: '',
      params: _.cloneDeep(params),
      returnType
    };

    // eth_call mode: Capitalize first letter of entity name (balanceOf -> BalanceOf, getBalanceOf, saveBalanceOf).
    // storage mode: Capiltalize second letter of entity name (_balances -> _Balances, _getBalances, _saveBalances).
    if (name.charAt(0) === '_') {
      const capitalizedName = `${name.charAt(1).toUpperCase()}${name.slice(2)}`;
      queryObject.entityName = `_${capitalizedName}`;
      queryObject.getQueryName = `_get${capitalizedName}`;
      queryObject.saveQueryName = `_save${capitalizedName}`;
    } else {
      const capitalizedName = `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
      queryObject.entityName = capitalizedName;
      queryObject.getQueryName = `get${capitalizedName}`;
      queryObject.saveQueryName = `save${capitalizedName}`;
    }

    queryObject.params = queryObject.params.map((param) => {
      const tsParamType = getTsForSol(param.type);
      assert(tsParamType);
      param.type = tsParamType;
      return param;
    });

    const tsReturnType = getTsForSol(returnType);
    assert(tsReturnType);
    queryObject.returnType = tsReturnType;

    this._queries.push(queryObject);
  }

  /**
   * Writes the database file generated from a template to a stream.
   * @param outStream A writable output stream to write the database file to.
   */
  exportDatabase (outStream: Writable): void {
    const template = Handlebars.compile(this._templateString);
    const obj = {
      queries: this._queries
    };
    const database = template(obj);
    outStream.write(database);
  }
}
