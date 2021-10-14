//
// Copyright 2021 Vulcanize, Inc.
//

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import Handlebars from 'handlebars';
import { Writable } from 'stream';
import _ from 'lodash';
import { gqlGenerate } from 'gql-generator';

import { getTsForSol } from './utils/type-mappings';
import { Param } from './utils/types';

const TEMPLATE_FILE = './templates/client-template.handlebars';

export class Client {
  _queries: Array<any>;
  _templateString: string;

  constructor () {
    this._queries = [];
    this._templateString = fs.readFileSync(path.resolve(__dirname, TEMPLATE_FILE)).toString();
  }

  /**
   * Stores the query to be passed to the template.
   * @param mode Code generation mode.
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
      getQueryName: '',
      params: _.cloneDeep(params),
      returnType
    };

    queryObject.getQueryName = (name.charAt(0) === '_')
      ? `_get${name.charAt(1).toUpperCase()}${name.slice(2)}`
      : `get${name.charAt(0).toUpperCase()}${name.slice(1)}`;

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
   * Writes the client file generated from a template to a stream and export quries.
   * @param outStream A writable output stream to write the client file to.
   * @param schemaContent Content of the schema for generating the queries, mutations and subscriptions.
   * @param gqlDir Directory to store the generated gql queries, mutations and subscriptions.
   */
  exportClient (outStream: Writable, schemaContent: string, gqlDir: string): void {
    this._exportGql(schemaContent, gqlDir);

    const template = Handlebars.compile(this._templateString);
    const client = template({
      queries: this._queries
    });
    outStream.write(client);
  }

  _exportGql (schemaContent: string, gqlDir: string): void {
    gqlGenerate(schemaContent, gqlDir);
  }
}
