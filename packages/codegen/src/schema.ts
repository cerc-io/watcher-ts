//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import { GraphQLSchema, printSchema } from 'graphql';
import { SchemaComposer } from 'graphql-compose';
import { Writable } from 'stream';

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
   * @returns GraphQLSchema object.
   */
  buildSchema (): GraphQLSchema {
    return this._composer.buildSchema();
  }

  /**
   * Writes schema to a stream.
   * @param outStream A writable output stream to write the schema to.
   */
  exportSchema (outStream: Writable): void {
    // Get schema as a string from GraphQLSchema.
    const schemaString = printSchema(this.buildSchema());
    outStream.write(schemaString);
  }

  /**
   * Adds basic types to the schema and typemapping.
   */
  _addBasicTypes (): void {
    // Create a scalar type composer to add the scalar BigInt in the schema composer.
    this._composer.createScalarTC({
      name: 'BigInt'
    });

    // Create a type composer to add the type Proof in the schema composer.
    this._composer.createObjectTC({
      name: 'Proof',
      fields: {
        data: 'String!'
      }
    });

    this._composer.createObjectTC({
      name: 'ResultBoolean',
      fields: {
        value: 'Boolean!',
        proof: () => this._composer.getOTC('Proof')
      }
    });

    this._composer.createObjectTC({
      name: 'ResultString',
      fields: {
        value: 'String!',
        proof: () => this._composer.getOTC('Proof')
      }
    });

    this._composer.createObjectTC({
      name: 'ResultInt',
      fields: {
        value: () => 'Int!',
        proof: () => this._composer.getOTC('Proof')
      }
    });

    this._composer.createObjectTC({
      name: 'ResultBigInt',
      fields: {
        // Get type composer object for BigInt scalar from the schema composer.
        value: () => this._composer.getSTC('BigInt').NonNull,
        proof: () => this._composer.getOTC('Proof')
      }
    });
  }

  /**
   * Adds types 'ResultEvent' and 'WatchedEvent' to the schema.
   */
  _addEventsRelatedTypes (): void {
    // Create Ethereum types.
    // Create the Block type.
    const blockName = 'Block';
    this._composer.createObjectTC({
      name: blockName,
      fields: {
        hash: 'String!',
        number: 'Int!',
        timestamp: 'Int!',
        parentHash: 'String!'
      }
    });

    // Create the Transaction type.
    const transactionName = 'Transaction';
    this._composer.createObjectTC({
      name: transactionName,
      fields: {
        hash: 'String!',
        index: 'Int!',
        from: 'String!',
        to: 'String!'
      }
    });

    // Create the ResultEvent type.
    const resultEventName = 'ResultEvent';
    this._composer.createObjectTC({
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
