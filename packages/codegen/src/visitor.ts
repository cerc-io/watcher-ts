//
// Copyright 2021 Vulcanize, Inc.
//

import { Writable } from 'stream';
import assert from 'assert';
import { utils } from 'ethers';
import { FunctionDefinition, StateVariableDeclaration } from '@solidity-parser/parser/dist/src/ast-types';

import { Database } from './database';
import { Entity } from './entity';
import { Indexer } from './indexer';
import { Resolvers } from './resolvers';
import { Schema } from './schema';
import { Client } from './client';
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
  _types: Types;
  _continueOnError: boolean;

  _contract?: { name: string, kind: string };

  constructor (continueOnErrorFlag = false) {
    this._schema = new Schema();
    this._resolvers = new Resolvers();
    this._indexer = new Indexer();
    this._entity = new Entity();
    this._database = new Database();
    this._client = new Client();
    this._types = new Types();
    this._continueOnError = continueOnErrorFlag;
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
  functionDefinitionVisitor (node: FunctionDefinition): void {
    if (node.stateMutability !== 'view' || !(node.visibility === 'external' || node.visibility === 'public')) {
      return;
    }

    // If function doesn't return anything skip creating watcher query
    if (!node.returnParameters) {
      return;
    }

    const name = node.name;
    assert(name);

    const params = node.parameters.map((item: any, index: number) => {
      const itemName = item.name ?? `arg${index}`;
      return { name: itemName, type: item.typeName.name };
    });

    let errorMessage = '';

    // Check for unhandled return type params
    node.returnParameters.forEach(returnParameter => {
      assert(returnParameter.typeName);

      const isTypeHandled = ['ElementaryTypeName', 'ArrayTypeName'].includes(returnParameter.typeName.type);

      if (!isTypeHandled) {
        errorMessage = `No support in codegen for type ${returnParameter.typeName.type} from method "${node.name}"`;

        if (this._continueOnError) {
          return;
        }

        throw new Error(errorMessage);
      }
    });

    if (this._continueOnError && errorMessage !== '') {
      console.log(errorMessage);
      return;
    }

    this._schema.addQuery(name, params, node.returnParameters);
    this._resolvers.addQuery(name, params);
    assert(this._contract);
    this._indexer.addQuery(this._contract.name, MODE_ETH_CALL, name, params, node.returnParameters);
    this._entity.addQuery(name, params, node.returnParameters);
    this._database.addQuery(name, params, node.returnParameters);
    this._client.addQuery(name, params);
  }

  /**
   * Visitor function for state variable declarations.
   * @param node ASTNode for a state variable declaration.
   */
  stateVariableDeclarationVisitor (node: StateVariableDeclaration): void {
    // TODO Handle multiples variables in a single line.
    // TODO Handle array types.
    // TODO Handle user defined type .
    const variable = node.variables[0];
    assert(variable.name);
    const name: string = variable.name;
    assert(variable.typeName);
    const stateVariableType: string = variable.typeName.type;
    const params: Param[] = [];

    if (variable.isImmutable) {
      // Skip in case variable is immutable.
      return;
    }

    let typeName = variable.typeName;
    let errorMessage = '';

    switch (typeName.type) {
      case 'Mapping': {
        let numParams = 0;

        // If the variable type is mapping, extract key as a param:
        // Eg. mapping(address => mapping(address => uint256)) private _allowances;
        while (typeName.type === 'Mapping') {
          if (typeName.keyType.type === 'UserDefinedTypeName') {
            errorMessage = 'No support in codegen for user defined type map keys';
            break;
          }

          params.push({ name: `key${numParams.toString()}`, type: typeName.keyType.name });
          typeName = typeName.valueType;
          numParams++;
        }

        if (typeName.type === 'UserDefinedTypeName') {
          errorMessage = 'No support in codegen for user defined type map values';
        }

        if (errorMessage !== '') {
          break;
        }

        // falls through
      }

      case 'ElementaryTypeName': {
        this._schema.addQuery(name, params, [variable]);
        this._resolvers.addQuery(name, params);
        assert(this._contract);
        this._indexer.addQuery(this._contract.name, MODE_STORAGE, name, params, [variable], stateVariableType);
        this._entity.addQuery(name, params, [variable]);
        this._database.addQuery(name, params, [variable]);
        this._client.addQuery(name, params);

        break;
      }

      case 'UserDefinedTypeName':
        errorMessage = `No support in codegen for user defined type state variable "${name}"`;
        break;

      case 'ArrayTypeName':
        errorMessage = `No support in codegen for array type state variable "${name}"`;
        break;

      default:
        errorMessage = `No support in codegen for return type "${typeName.type}" from method "${name}"`;
    }

    if (errorMessage !== '') {
      if (this._continueOnError) {
        console.log(errorMessage);
        return;
      }

      throw new Error(errorMessage);
    }
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

  visitSubgraph (subgraphPath?: string, subgraphConfig?: any): void {
    if (!subgraphPath || !subgraphConfig) {
      return;
    }

    // Parse subgraph schema to get subgraphSchemaDocument.
    const subgraphSchemaDocument = parseSubgraphSchema(subgraphPath, subgraphConfig);

    this._schema.addSubgraphSchema(subgraphSchemaDocument);
    this._types.addSubgraphTypes(subgraphSchemaDocument);
    this._entity.addSubgraphEntities(subgraphSchemaDocument);
    this._resolvers.addSubgraphResolvers(subgraphSchemaDocument);
    this._indexer.addSubgraphEntities(subgraphSchemaDocument);
    this._database.addSubgraphEntities(subgraphSchemaDocument);
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
  exportEntities (entityDir: string, subgraphPath: string): void {
    this._entity.exportEntities(entityDir, subgraphPath);
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
   * Writes the types file generated from a template to a stream.
   * @param outStream A writable output stream to write the database file to.
   */
  exportTypes (outStream: Writable): void {
    this._types.exportTypes(outStream);
  }
}
