//
// Copyright 2021 Vulcanize, Inc.
//

import { Writable } from 'stream';

import { Database } from './database';
import { Entity } from './entity';
import { Indexer } from './indexer';
import { Resolvers } from './resolvers';
import { Schema } from './schema';
import { Client } from './client';
import { Reset } from './reset';
import { Param } from './utils/types';
import { MODE_ETH_CALL, MODE_STORAGE } from './utils/constants';
import { parseSubgraphSchema } from './utils/subgraph';
import { Types } from './types';

export class Visitor {
  _schema: Schema;
  _resolvers: Resolvers;
  _indexer: Indexer;
  _entity: Entity;
  _database: Database;
  _client: Client;
  _reset: Reset;
  _types: Types;

  constructor () {
    this._schema = new Schema();
    this._resolvers = new Resolvers();
    this._indexer = new Indexer();
    this._entity = new Entity();
    this._database = new Database();
    this._client = new Client();
    this._reset = new Reset();
    this._types = new Types();
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

      const typeName = node.returnParameters[0].typeName;

      // TODO Handle user defined type return.
      if (typeName.type === 'UserDefinedTypeName') {
        // Skip in case of UserDefinedTypeName.
        return;
      }

      // TODO Handle multiple return parameters and array return type.
      const returnType = typeName.name;

      this._schema.addQuery(name, params, returnType);
      this._resolvers.addQuery(name, params, returnType);
      this._indexer.addQuery(MODE_ETH_CALL, name, params, returnType);
      this._entity.addQuery(name, params, returnType);
      this._database.addQuery(name, params, returnType);
      this._client.addQuery(name, params, returnType);
      this._reset.addQuery(name);
    }
  }

  /**
   * Visitor function for state variable declarations.
   * @param node ASTNode for a state variable declaration.
   */
  stateVariableDeclarationVisitor (node: any): void {
    // TODO Handle multiples variables in a single line.
    // TODO Handle array types.
    const variable = node.variables[0];
    const name: string = variable.name;
    const stateVariableType: string = variable.typeName.type;

    const params: Param[] = [];

    let typeName = variable.typeName;

    // TODO Handle user defined type.
    if (typeName.type === 'UserDefinedTypeName') {
      // Skip in case of UserDefinedTypeName.
      return;
    }

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
    this._indexer.addQuery(MODE_STORAGE, name, params, returnType, stateVariableType);
    this._entity.addQuery(name, params, returnType);
    this._database.addQuery(name, params, returnType);
    this._client.addQuery(name, params, returnType);
    this._reset.addQuery(name);
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

  visitSubgraph (subgraphPath?: string): void {
    if (!subgraphPath) {
      return;
    }

    // Parse subgraph schema to get subgraphSchemaDocument.
    const subgraphSchemaDocument = parseSubgraphSchema(subgraphPath);

    this._schema.addSubgraphSchema(subgraphSchemaDocument);
    this._types.addSubgraphTypes(subgraphSchemaDocument);
    this._entity.addSubgraphEntities(subgraphSchemaDocument);
    this._resolvers.addSubgraphResolvers(subgraphSchemaDocument);
    this._reset.addSubgraphEntities(subgraphSchemaDocument);
  }

  /**
   * Writes schema to a stream.
   * @param outStream A writable output stream to write the schema to.
   * @returns The schema string.
   */
  exportSchema (outStream: Writable): string {
    return this._schema.exportSchema(outStream);
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
   * @param inputFileName Input contract file names to be passed to the template.
   */
  exportIndexer (outStream: Writable, inputFileNames: string[]): void {
    this._indexer.exportIndexer(outStream, inputFileNames);
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

  /**
   * Writes the client file generated from a template to a stream and export quries.
   * @param outStream A writable output stream to write the client file to.
   * @param schemaContent Content of the schema for generating the queries, mutations and subscriptions.
   * @param gqlDir Directory to store the generated gql queries, mutations and subscriptions.
   */
  exportClient (outStream: Writable, schemaContent: string, gqlDir: string): void {
    this._client.exportClient(outStream, schemaContent, gqlDir);
  }

  /**
   * Writes the reset.ts, job-queue.ts, state.ts files generated from templates to respective streams.
   * @param resetOutStream A writable output stream to write the reset file to.
   * @param resetJQOutStream A writable output stream to write the reset job-queue file to.
   * @param resetStateOutStream A writable output stream to write the reset state file to.
   */
  exportReset (resetOutStream: Writable, resetJQOutStream: Writable, resetStateOutStream: Writable): void {
    this._reset.exportReset(resetOutStream, resetJQOutStream, resetStateOutStream);
  }

  /**
   * Writes the types file generated from a template to a stream.
   * @param outStream A writable output stream to write the database file to.
   */
  exportTypes (outStream: Writable): void {
    this._types.exportTypes(outStream);
  }
}
