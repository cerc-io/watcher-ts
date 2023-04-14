//
// Copyright 2021 Vulcanize, Inc.
//

import fs from 'fs';
import path from 'path';
import { Writable } from 'stream';
import Handlebars from 'handlebars';
import assert from 'assert';
import _ from 'lodash';

import { getTsForSol } from './utils/type-mappings';
import { Param, getBaseType } from './utils/types';

const TEMPLATE_FILE = './templates/resolvers-template.handlebars';

export class Resolvers {
  _queries: Array<any>;
  _subgraphQueries: Array<any>;
  _templateString: string;

  constructor () {
    this._queries = [];
    this._subgraphQueries = [];
    this._templateString = fs.readFileSync(path.resolve(__dirname, TEMPLATE_FILE)).toString();
  }

  /**
   * Stores the query to be passed to the template.
   * @param name Name of the query.
   * @param params Parameters to the query.
   * @param returnType Return type for the query.
   */
  addQuery (name: string, params: Array<Param>, typeName: string): void {
    // Check if the query is already added.
    if (this._queries.some(query => query.name === name)) {
      return;
    }
    const returnType = getBaseType(typeName);
    assert(returnType);

    const queryObject = {
      name,
      params: _.cloneDeep(params),
      returnType
    };

    queryObject.params = queryObject.params.map((param) => {
      const tsParamType = getTsForSol(param.type);
      assert(tsParamType);
      param.type = tsParamType;
      return param;
    });

    this._queries.push(queryObject);
  }

  addSubgraphResolvers (subgraphSchemaDocument: any): void {
    const subgraphTypeDefs = subgraphSchemaDocument.definitions;

    for (const subgraphTypeDef of subgraphTypeDefs) {
      if (subgraphTypeDef.kind !== 'ObjectTypeDefinition') {
        continue;
      }

      const entityName = subgraphTypeDef.name.value;
      const queryName = `${entityName.charAt(0).toLowerCase()}${entityName.slice(1)}`;

      const queryObject = {
        entityName,
        queryName
      };

      this._subgraphQueries.push(queryObject);
    }
  }

  /**
   * Writes the resolvers file generated from a template to a stream.
   * @param outStream A writable output stream to write the resolvers file to.
   */
  exportResolvers (outStream: Writable): void {
    const template = Handlebars.compile(this._templateString);
    const obj = {
      queries: this._queries,
      subgraphQueries: this._subgraphQueries
    };
    const resolvers = template(obj);
    outStream.write(resolvers);
  }
}
