//
// Copyright 2021 Vulcanize, Inc.
//

import { Writable } from 'stream';

import { Database } from './database';
import { Param } from './utils/types';
import { MODE_ETH_CALL, MODE_STORAGE } from './utils/constants';
import { Entity } from './entity';
import { Indexer } from './indexer';
import { Resolvers } from './resolvers';
import { Schema } from './schema';

export class Visitor {
  _schema: Schema;
  _resolvers: Resolvers;
  _indexer: Indexer;
  _entity: Entity;
  _database: Database;

  constructor () {
    this._schema = new Schema();
    this._resolvers = new Resolvers();
    this._indexer = new Indexer();
    this._entity = new Entity();
    this._database = new Database();
  }

  /**
   * Visitor function for function definitions.
   * @param node ASTNode for a function definition.
   */
  functionDefinitionVisitor (node: any): void {
    if (node.stateMutability === 'view' && (node.visibility === 'external' || node.visibility === 'public')) {
      const name = node.name;
      const params = node.parameters.map((item: any) => {
        return { name: item.name, type: item.typeName.name };
      });

      // TODO Handle multiple return parameters and array return type.
      const returnType = node.returnParameters[0].typeName.name;

      this._schema.addQuery(name, params, returnType);
      this._resolvers.addQuery(name, params, returnType);
      this._indexer.addQuery(MODE_ETH_CALL, name, params, returnType);
      this._entity.addQuery(name, params, returnType);
      this._database.addQuery(name, params, returnType);
    }
  }

  /**
   * Visitor function for state variable declarations.
   * @param node ASTNode for a state variable declaration.
   */
  stateVariableDeclarationVisitor (node: any): void {
    // TODO Handle multiples variables in a single line.
    // TODO Handle array types.
    const name: string = node.variables[0].name;

    const params: Param[] = [];

    let typeName = node.variables[0].typeName;
    let numParams = 0;

    // If the variable type is mapping, extract key as a param:
    // Eg. mapping(address => mapping(address => uint256)) private _allowances;
    while (typeName.type === 'Mapping') {
      params.push({ name: `key${numParams.toString()}`, type: typeName.keyType.name });
      typeName = typeName.valueType;
      numParams++;
    }

    const returnType = typeName.name;

    this._schema.addQuery(name, params, returnType);
    this._resolvers.addQuery(name, params, returnType);
    this._indexer.addQuery(MODE_STORAGE, name, params, returnType);
    this._entity.addQuery(name, params, returnType);
    this._database.addQuery(name, params, returnType);
  }

  /**
   * Visitor function for event definitions.
   * @param node ASTNode for an event definition.
   */
  eventDefinitionVisitor (node: any): void {
    const name = node.name;
    const params = node.parameters.map((item: any) => {
      return { name: item.name, type: item.typeName.name };
    });

    this._schema.addEventType(name, params);
    this._indexer.addEvent(name, params);
  }

  /**
   * Writes schema to a stream.
   * @param outStream A writable output stream to write the schema to.
   */
  exportSchema (outStream: Writable): void {
    this._schema.exportSchema(outStream);
  }

  /**
   * Writes the resolvers file generated from a template to a stream.
   * @param outStream A writable output stream to write the resolvers file to.
   */
  exportResolvers (outStream: Writable): void {
    this._resolvers.exportResolvers(outStream);
  }

  /**
   * Writes the indexer file generated from a template to a stream.
   * @param outStream A writable output stream to write the indexer file to.
   * @param inputFileName Input contract file name to be passed to the template.
   */
  exportIndexer (outStream: Writable, inputFileName: string): void {
    this._indexer.exportIndexer(outStream, inputFileName);
  }

  /**
   * Writes the generated entity files in the given directory.
   * @param entityDir Directory to write the entities to.
   */
  exportEntities (entityDir: string): void {
    this._entity.exportEntities(entityDir);
  }

  /**
   * Writes the database file generated from a template to a stream.
   * @param outStream A writable output stream to write the database file to.
   */
  exportDatabase (outStream: Writable): void {
    this._database.exportDatabase(outStream);
  }
}
