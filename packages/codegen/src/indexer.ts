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
import { compareHelper, capitalizeHelper } from './utils/handlebar-helpers';

const TEMPLATE_FILE = './templates/indexer-template.handlebars';

export class Indexer {
  _queries: Array<any>;
  _templateString: string;

  constructor () {
    this._queries = [];
    this._templateString = fs.readFileSync(path.resolve(__dirname, TEMPLATE_FILE)).toString();

    Handlebars.registerHelper('compare', compareHelper);
    Handlebars.registerHelper('capitalize', capitalizeHelper);
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
      name: name,
      params: _.cloneDeep(params),
      returnType: returnType
    };

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
   * Writes the indexer file generated from a template to a stream.
   * @param outStream A writable output stream to write the indexer file to.
   * @param inputFileName Input contract file name to be passed to the template.
   */
  exportIndexer (outStream: Writable, inputFileName: string): void {
    const template = Handlebars.compile(this._templateString);
    const obj = {
      inputFileName,
      queries: this._queries
    };
    const indexer = template(obj);
    outStream.write(indexer);
  }
}
