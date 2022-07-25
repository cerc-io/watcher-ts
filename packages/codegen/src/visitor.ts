//
// Copyright 2021 Vulcanize, Inc.
//

import { Writable } from 'stream';
import assert from 'assert';
import { utils } from 'ethers';

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

  _contract?: { name: string, kind: string };

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

  setContract (name: string, kind: string): void {
    this._contract = {
      name,
      kind
    };
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
      this._entity.addQuery(name, params, returnType);
      this._database.addQuery(name, params, returnType);
      this._client.addQuery(name, params, returnType);
      this._reset.addQuery(name);

      assert(this._contract);
      this._indexer.addQuery(this._contract.name, MODE_ETH_CALL, name, params, returnType);
    }
  }

  /**
   * Visitor function for state variable declarations.
   * @param node ASTNode for a state variable declaration.
   */
  stateVariableDeclarationVisitor (node: any): void {
    // TODO Handle multiples variables in a single line.
    // TODO Handle array types.
    // TODO Handle user defined type .
    const variable = node.variables[0];
    const name: string = variable.name;
    const stateVariableType: string = variable.typeName.type;
    const params: Param[] = [];

    if (variable.isImmutable) {
      // Skip in case variable is immutable.
      return;
    }

    let typeName = variable.typeName;
    let numParams = 0;

    // If the variable type is mapping, extract key as a param:
    // Eg. mapping(address => mapping(address => uint256)) private _allowances;
    while (typeName.type === 'Mapping') {
      params.push({ name: `key${numParams.toString()}`, type: typeName.keyType.name });
      typeName = typeName.valueType;
      numParams++;
    }

    if (['UserDefinedTypeName', 'ArrayTypeName'].includes(typeName.type)) {
      // Skip in case of UserDefinedTypeName | ArrayTypeName.
      return;
    }

    const returnType = typeName.name;

    this._schema.addQuery(name, params, returnType);
    this._resolvers.addQuery(name, params, returnType);
    this._entity.addQuery(name, params, returnType);
    this._database.addQuery(name, params, returnType);
    this._client.addQuery(name, params, returnType);
    this._reset.addQuery(name);

    assert(this._contract);
    this._indexer.addQuery(this._contract.name, MODE_STORAGE, name, params, returnType, stateVariableType);
  }

  /**
   * Function to parse event definitions.
   * @param abi Contract ABI.
   */
  parseEvents (abi: any): void {
    const contractInterface = new utils.Interface(abi);

    Object.values(contractInterface.events).forEach(event => {
      this._schema.addEventType(event.name, event.inputs);
    });
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
    this._indexer.addSubgraphEntities(subgraphSchemaDocument);
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
   * @param contracts Input contracts to be passed to the template.
   */
  exportIndexer (outStream: Writable, contracts: any[]): void {
    this._indexer.exportIndexer(outStream, contracts);
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
  exportReset (resetOutStream: Writable, resetJQOutStream: Writable, resetStateOutStream: Writable, subgraphPath: string): void {
    this._reset.exportReset(resetOutStream, resetJQOutStream, resetStateOutStream, subgraphPath);
  }

  /**
   * Writes the types file generated from a template to a stream.
   * @param outStream A writable output stream to write the database file to.
   */
  exportTypes (outStream: Writable): void {
    this._types.exportTypes(outStream);
  }
}
