//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import { GraphQLSchema, parse, printSchema, print } from 'graphql';
import { SchemaComposer } from 'graphql-compose';
import { Writable } from 'stream';
import _ from 'lodash';

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
    // Check if the query is already added.
    if (this._composer.Query.hasField(name)) {
      return;
    }

    // TODO: Handle cases where returnType/params type is an array.
    const tsReturnType = getTsForSol(returnType);
    assert(tsReturnType, `ts type for sol type ${returnType} for ${name} not found`);

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
        assert(tsCurrType, `ts type for sol type ${curr.type} for ${curr.name} not found`);
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

    // Check if the type is already added.
    if (this._composer.has(name)) {
      return;
    }

    const typeObject: any = {};
    typeObject.name = name;
    typeObject.fields = {};

    if (params.length > 0) {
      typeObject.fields = params.reduce((acc, curr) => {
        const tsCurrType = getTsForSol(curr.type);
        assert(tsCurrType, `ts type for sol type ${curr.type} for ${curr.name} not found`);
        acc[curr.name] = `${getGqlForTs(tsCurrType)}!`;
        return acc;
      }, typeObject.fields);
    } else {
      // Types must define one or more fields.
      typeObject.fields = {
        dummy: 'String'
      };
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
   * @returns GraphQLSchema object.
   */
  buildSchema (): GraphQLSchema {
    // Add a mutation for watching a contract.
    this._addWatchContractMutation();

    // Add IPLDBlock type and queries.
    this._addIPLDType();
    this._addIPLDQuery();

    // Build the schema.
    return this._composer.buildSchema();
  }

  /**
   * Writes schema to a stream.
   * @param outStream A writable output stream to write the schema to.
   * @returns The schema string.
   */
  exportSchema (outStream: Writable): string {
    // Get schema as a string from GraphQLSchema.
    const schemaString = printSchema(this.buildSchema());
    outStream.write(schemaString);

    return schemaString;
  }

  addSubgraphSchema (subgraphSchemaDocument: any): void {
    // Generating the current types.
    const schema = this._composer.buildSchema();

    const schemaString = printSchema(schema);

    // Parse the schema into a DocumentNode.
    const schemaDocument = parse(schemaString);

    // Get schema types.
    const schemaTypes = schemaDocument.definitions.map((def: any) => {
      return def.name.value;
    });

    // Filtering out existing types from subgraph types.
    const subgraphTypeDefs = subgraphSchemaDocument.definitions.filter((def: any) => {
      return !schemaTypes.includes(def.name.value);
    });

    // Re-assigning the typeDefs.
    const modifiedSchemaDocument = _.cloneDeep(subgraphSchemaDocument);
    modifiedSchemaDocument.definitions = subgraphTypeDefs;

    // Adding subgraph-schema types to the schema composer.
    const subgraphTypeDefsString = print(modifiedSchemaDocument);
    this._composer.addTypeDefs(subgraphTypeDefsString);

    // Create the Block_height input needed in subgraph queries.
    const typeComposer = this._composer.createInputTC({
      name: 'Block_height',
      fields: {
        hash: 'Bytes',
        number: 'Int'
      }
    });
    this._composer.addSchemaMustHaveType(typeComposer);

    // Add subgraph-schema entity queries to the schema composer.
    this._addSubgraphSchemaQueries(subgraphTypeDefs);
  }

  _addSubgraphSchemaQueries (subgraphTypeDefs: any): void {
    for (const subgraphTypeDef of subgraphTypeDefs) {
      // Filtering out enums.
      if (subgraphTypeDef.kind !== 'ObjectTypeDefinition') {
        continue;
      }

      const subgraphType = subgraphTypeDef.name.value;

      // Lowercase first letter for query name.
      const queryName = `${subgraphType.charAt(0).toLowerCase()}${subgraphType.slice(1)}`;

      const queryObject: { [key: string]: any; } = {};
      queryObject[queryName] = {
        // Get type composer object for return type from the schema composer.
        type: this._composer.getAnyTC(subgraphType).NonNull,
        args: {
          id: 'String!',
          block: 'Block_height'
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

    // Create a scalar type composer to add the scalar BigDecimal in the schema composer.
    typeComposer = this._composer.createScalarTC({
      name: 'BigDecimal'
    });
    this._composer.addSchemaMustHaveType(typeComposer);

    // Create a scalar type composer to add the scalar Bytes in the schema composer.
    typeComposer = this._composer.createScalarTC({
      name: 'Bytes'
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

    // Create the Block type.
    typeComposer = this._composer.createObjectTC({
      name: '_Block_',
      fields: {
        cid: 'String!',
        hash: 'String!',
        number: 'Int!',
        timestamp: 'Int!',
        parentHash: 'String!'
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
    // Create the Transaction type.
    const transactionName = '_Transaction_';
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
        block: () => this._composer.getOTC('_Block_').NonNull,
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
        block: () => this._composer.getOTC('_Block_').NonNull,
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
