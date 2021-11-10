//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import path from 'path';
import { GraphQLSchema, parse, printSchema, print } from 'graphql';
import { SchemaComposer } from 'graphql-compose';
import { Writable } from 'stream';

import { loadFilesSync } from '@graphql-tools/load-files';

import { getTsForSol, getGqlForTs } from './utils/type-mappings';
import { Param } from './utils/types';

export class Schema {
  _composer: SchemaComposer;
  _events: Array<string>;

  constructor () {
    this._composer = new SchemaComposer();
    this._events = [];

    this._addBasicTypes();
  }

  /**
   * Adds a query to the schema with the given parameters.
   * @param name Name of the query.
   * @param params Parameters to the query.
   * @param returnType Return type for the query.
   */
  addQuery (name: string, params: Array<Param>, returnType: string): void {
    // TODO: Handle cases where returnType/params type is an array.
    const tsReturnType = getTsForSol(returnType);
    assert(tsReturnType);

    const queryObject: { [key: string]: any; } = {};
    queryObject[name] = {
      // Get type composer object for return type from the schema composer.
      type: this._composer.getOTC(`Result${getGqlForTs(tsReturnType)}`).NonNull,
      args: {
        blockHash: 'String!',
        contractAddress: 'String!'
      }
    };

    if (params.length > 0) {
      queryObject[name].args = params.reduce((acc, curr) => {
        const tsCurrType = getTsForSol(curr.type);
        assert(tsCurrType);
        acc[curr.name] = `${getGqlForTs(tsCurrType)}!`;
        return acc;
      }, queryObject[name].args);
    }

    // Add a query to the schema composer using queryObject.
    this._composer.Query.addFields(queryObject);
  }

  /**
   * Adds a type to the schema for an event.
   * @param name Event name.
   * @param params Event parameters.
   */
  addEventType (name: string, params: Array<Param>): void {
    name = `${name}Event`;

    const typeObject: any = {};
    typeObject.name = name;
    typeObject.fields = {};

    if (params.length > 0) {
      typeObject.fields = params.reduce((acc, curr) => {
        const tsCurrType = getTsForSol(curr.type);
        assert(tsCurrType);
        acc[curr.name] = `${getGqlForTs(tsCurrType)}!`;
        return acc;
      }, typeObject.fields);
    }

    // Create a type composer to add the required type in the schema composer.
    this._composer.createObjectTC(typeObject);

    this._events.push(name);
    this._addToEventUnion(name);

    if (this._events.length === 1) {
      this._addEventsRelatedTypes();
      this._addEventsQuery();
      this._addEventSubscription();
    }
  }

  /**
   * Builds the schema from the schema composer.
   * @param subgraphSchemaPath Subgraph schema path.
   * @returns GraphQLSchema object.
   */
  buildSchema (subgraphSchemaPath?: string): GraphQLSchema {
    // Add a mutation for watching a contract.
    this._addWatchContractMutation();

    // Add IPLDBlock type and queries.
    this._addIPLDType();
    this._addIPLDQuery();

    const schema = this._composer.buildSchema();

    if (!subgraphSchemaPath) {
      return schema;
    }

    // Add subgraph schema types to the schema composer if path provided.
    this._addSubgraphSchema(schema, subgraphSchemaPath);

    // Rebuild the schema.
    return this._composer.buildSchema();
  }

  /**
   * Writes schema to a stream.
   * @param outStream A writable output stream to write the schema to.
   * @param subgraphSchemaPath Subgraph schema path.
   * @returns The schema string.
   */
  exportSchema (outStream: Writable, subgraphSchemaPath?: string): string {
    // Get schema as a string from GraphQLSchema.
    const schemaString = printSchema(this.buildSchema(subgraphSchemaPath));
    outStream.write(schemaString);

    return schemaString;
  }

  _addSubgraphSchema (schema: GraphQLSchema, subgraphSchemaPath: string): void {
    const schemaString = printSchema(schema);

    // Parse the schema into a DocumentNode.
    const schemaDocument = parse(schemaString);
    const schemaTypes: string[] = schemaDocument.definitions.map((def: any) => {
      return def.name.value;
    });

    // Generate the subgraph schema DocumentNode.
    const subgraphSchemaDocument = this._parseSubgraphSchema(schemaTypes, subgraphSchemaPath);

    // Adding subgraph-schema types to the schema composer.
    const subgraphTypeDefs = print(subgraphSchemaDocument);
    this._composer.addTypeDefs(subgraphTypeDefs);

    // Add subgraph-schema entity queries to the schema composer.
    this._addSubgraphSchemaQueries(subgraphSchemaDocument);
  }

  _parseSubgraphSchema (schemaTypes: string[], schemaPath: string): any {
    const typesArray = loadFilesSync(path.resolve(schemaPath));

    // Get a subgraph-schema DocumentNode with existing types.
    const subgraphSchemaDocument = typesArray[0];
    let subgraphTypeDefs = subgraphSchemaDocument.definitions;

    // Remove duplicates.
    subgraphTypeDefs = subgraphTypeDefs.filter((def: any) => {
      return !schemaTypes.includes(def.name.value);
    });

    const subgraphTypes: string[] = subgraphTypeDefs.map((def: any) => {
      return def.name.value;
    });

    const defaultTypes = ['Int', 'Float', 'String', 'Boolean', 'ID'];

    const knownTypes = schemaTypes.concat(subgraphTypes, defaultTypes);

    subgraphTypeDefs.forEach((def: any) => {
      // Remove type directives.
      def.directives = [];

      if (def.kind === 'ObjectTypeDefinition') {
        def.fields.forEach((field: any) => {
          // Remove field directives.
          field.directives = [];

          // Parse the field type.
          field.type = this._parseType(knownTypes, field.type);
        }, this);
      }
    }, this);

    subgraphSchemaDocument.definitions = subgraphTypeDefs;

    // Return a modified subgraph-schema DocumentNode.
    return subgraphSchemaDocument;
  }

  _parseType (knownTypes: string[], typeNode: any): any {
    // Check if 'NamedType' is reached.
    if (typeNode.kind === 'NamedType') {
      const typeName = typeNode.name.value;

      // TODO Handle extra types provided by the graph.
      // Replace unknown types with 'String'.
      if (!knownTypes.includes(typeName)) {
        typeNode.name.value = 'String';
      }
    } else {
      typeNode.type = this._parseType(knownTypes, typeNode.type);
    }

    return typeNode;
  }

  _addSubgraphSchemaQueries (subgraphSchemaDocument: any): void {
    // Get the subgraph type names.
    const subgraphTypes: string[] = subgraphSchemaDocument.definitions.reduce((acc: any, curr: any) => {
      // Filtering out enums.
      if (curr.kind === 'ObjectTypeDefinition') {
        acc.push(curr.name.value);
      }

      return acc;
    }, []);

    for (const subgraphType of subgraphTypes) {
      // Lowercase first letter for query name.
      const queryName = `${subgraphType.charAt(0).toLowerCase()}${subgraphType.slice(1)}`;

      const queryObject: { [key: string]: any; } = {};
      queryObject[queryName] = {
        // Get type composer object for return type from the schema composer.
        type: this._composer.getAnyTC(subgraphType).NonNull,
        args: {
          id: 'String!',
          blockHash: 'String!'
        }
      };

      this._composer.Query.addFields(queryObject);
    }
  }

  /**
   * Adds basic types to the schema and typemapping.
   */
  _addBasicTypes (): void {
    let typeComposer;

    // Create a scalar type composer to add the scalar BigInt in the schema composer.
    typeComposer = this._composer.createScalarTC({
      name: 'BigInt'
    });
    this._composer.addSchemaMustHaveType(typeComposer);

    // Create a type composer to add the type Proof in the schema composer.
    typeComposer = this._composer.createObjectTC({
      name: 'Proof',
      fields: {
        data: 'String!'
      }
    });
    this._composer.addSchemaMustHaveType(typeComposer);

    typeComposer = this._composer.createObjectTC({
      name: 'ResultBoolean',
      fields: {
        value: 'Boolean!',
        proof: () => this._composer.getOTC('Proof')
      }
    });
    this._composer.addSchemaMustHaveType(typeComposer);

    typeComposer = this._composer.createObjectTC({
      name: 'ResultString',
      fields: {
        value: 'String!',
        proof: () => this._composer.getOTC('Proof')
      }
    });
    this._composer.addSchemaMustHaveType(typeComposer);

    typeComposer = this._composer.createObjectTC({
      name: 'ResultInt',
      fields: {
        value: () => 'Int!',
        proof: () => this._composer.getOTC('Proof')
      }
    });
    this._composer.addSchemaMustHaveType(typeComposer);

    typeComposer = this._composer.createObjectTC({
      name: 'ResultBigInt',
      fields: {
        // Get type composer object for BigInt scalar from the schema composer.
        value: () => this._composer.getSTC('BigInt').NonNull,
        proof: () => this._composer.getOTC('Proof')
      }
    });
    this._composer.addSchemaMustHaveType(typeComposer);
  }

  /**
   * Adds types 'ResultEvent' and 'WatchedEvent' to the schema.
   */
  _addEventsRelatedTypes (): void {
    let typeComposer;

    // Create Ethereum types.
    // Create the Block type.
    const blockName = 'Block';
    typeComposer = this._composer.createObjectTC({
      name: blockName,
      fields: {
        cid: 'String!',
        hash: 'String!',
        number: 'Int!',
        timestamp: 'Int!',
        parentHash: 'String!'
      }
    });
    this._composer.addSchemaMustHaveType(typeComposer);

    // Create the Transaction type.
    const transactionName = 'Transaction';
    typeComposer = this._composer.createObjectTC({
      name: transactionName,
      fields: {
        hash: 'String!',
        index: 'Int!',
        from: 'String!',
        to: 'String!'
      }
    });
    this._composer.addSchemaMustHaveType(typeComposer);

    // Create the ResultEvent type.
    const resultEventName = 'ResultEvent';
    typeComposer = this._composer.createObjectTC({
      name: resultEventName,
      fields: {
        // Get type composer object for 'blockName' type from the schema composer.
        block: () => this._composer.getOTC(blockName).NonNull,
        tx: () => this._composer.getOTC(transactionName).NonNull,
        contract: 'String!',
        eventIndex: 'Int!',
        event: () => this._composer.getUTC('Event').NonNull,
        proof: () => this._composer.getOTC('Proof')
      }
    });
    this._composer.addSchemaMustHaveType(typeComposer);
  }

  /**
   * Adds a query for events to the schema.
   */
  _addEventsQuery (): void {
    this._composer.Query.addFields({
      events: {
        type: [this._composer.getOTC('ResultEvent').NonNull],
        args: {
          blockHash: 'String!',
          contractAddress: 'String!',
          name: 'String'
        }
      }
    });

    this._composer.Query.addFields({
      eventsInRange: {
        type: [this._composer.getOTC('ResultEvent').NonNull],
        args: {
          fromBlockNumber: 'Int!',
          toBlockNumber: 'Int!'
        }
      }
    });
  }

  _addIPLDType (): void {
    const typeComposer = this._composer.createObjectTC({
      name: 'ResultIPLDBlock',
      fields: {
        block: () => this._composer.getOTC('Block').NonNull,
        contractAddress: 'String!',
        cid: 'String!',
        kind: 'String!',
        data: 'String!'
      }
    });
    this._composer.addSchemaMustHaveType(typeComposer);
  }

  _addIPLDQuery (): void {
    this._composer.Query.addFields({
      getStateByCID: {
        type: this._composer.getOTC('ResultIPLDBlock'),
        args: {
          cid: 'String!'
        }
      }
    });

    this._composer.Query.addFields({
      getState: {
        type: this._composer.getOTC('ResultIPLDBlock'),
        args: {
          blockHash: 'String!',
          contractAddress: 'String!',
          kind: 'String'
        }
      }
    });
  }

  /**
   * Adds an event subscription to the schema.
   */
  _addEventSubscription (): void {
    // Add a subscription to the schema composer.
    this._composer.Subscription.addFields({
      onEvent: () => this._composer.getOTC('ResultEvent').NonNull
    });
  }

  /**
   * Adds a watchContract mutation to the schema.
   */
  _addWatchContractMutation (): void {
    // Add a mutation to the schema composer.
    this._composer.Mutation.addFields({
      watchContract: {
        type: 'Boolean!',
        args: {
          address: 'String!',
          kind: 'String!',
          checkpoint: 'Boolean!',
          startingBlock: 'Int'
        }
      }
    });
  }

  /**
   * Adds an 'Event' union (if doesn't exist) to the schema. Adds the specified event to the 'Event' union.
   * @param event Event type name to add to the union.
   */
  _addToEventUnion (event: string): void {
    // Get (or create if doesn't exist) type composer object for Event union from the schema composer.
    const eventUnion = this._composer.getOrCreateUTC('Event');
    // Add a new type to the union.
    eventUnion.addType(this._composer.getOTC(event));
  }
}
