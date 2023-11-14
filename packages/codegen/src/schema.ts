//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import { GraphQLSchema, parse, printSchema, print, GraphQLDirective, GraphQLInt, GraphQLBoolean, GraphQLEnumType, DefinitionNode, GraphQLString, GraphQLNonNull } from 'graphql';
import { ObjectTypeComposer, NonNullComposer, ObjectTypeComposerDefinition, ObjectTypeComposerFieldConfigMapDefinition, SchemaComposer } from 'graphql-compose';
import { Writable } from 'stream';
import { utils } from 'ethers';
import { VariableDeclaration } from '@solidity-parser/parser/dist/src/ast-types';
import pluralize from 'pluralize';

import { getGqlForSol } from './utils/type-mappings';
import { Param } from './utils/types';
import { getBaseType, isArrayType, lowerCamelCase } from './utils/helpers';

const OrderDirection = 'OrderDirection';
const BlockHeight = 'Block_height';

export class Schema {
  _composer: SchemaComposer;
  _events: Array<string>;

  constructor () {
    this._composer = new SchemaComposer();
    this._events = [];

    this._addGQLCacheTypes();
    this._addBasicTypes();
  }

  /**
   * Adds a query to the schema with the given parameters.
   * @param name Name of the query.
   * @param params Parameters to the query.
   * @param returnType Return type for the query.
   */
  addQuery (name: string, params: Array<Param>, returnParameters: VariableDeclaration[]): void {
    // Check if the query is already added.
    if (this._composer.Query.hasField(name)) {
      return;
    }

    const objectTC = this._getOrCreateResultType(name, returnParameters);

    const queryObject: { [key: string]: any; } = {};
    queryObject[name] = {
      // Get type composer object for return type from the schema composer.
      type: objectTC.NonNull,
      args: {
        blockHash: 'String!',
        contractAddress: 'String!'
      }
    };

    if (params.length > 0) {
      // TODO: Handle cases where params type is an array.
      queryObject[name].args = params.reduce((acc, curr) => {
        acc[curr.name] = `${getGqlForSol(curr.type)}!`;
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
  addEventType (name: string, params: Array<utils.ParamType>): void {
    name = `${name}Event`;

    // Check if the type is already added.
    if (this._composer.has(name)) {
      this._resolveEventConflict(name, params);

      return;
    }

    this._createObjectType(name, params);
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

    // Add State type and queries.
    this._addStateType();
    this._addStateQuery();

    // Add type and query for SyncStatus.
    this._addSyncStatus();

    // Add type and query for meta data
    this._addMeta();

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
    // Using JSON stringify and parse as lodash cloneDeep throws error.
    const modifiedSchemaDocument = JSON.parse(JSON.stringify(subgraphSchemaDocument));
    modifiedSchemaDocument.definitions = subgraphTypeDefs;

    // Adding subgraph-schema types to the schema composer.
    const subgraphTypeDefsString = print(modifiedSchemaDocument);
    this._composer.addTypeDefs(subgraphTypeDefsString);

    // Create the Block_height input needed in subgraph queries.
    let typeComposer: any = this._composer.createInputTC({
      name: BlockHeight,
      fields: {
        hash: 'Bytes',
        number: 'Int'
      }
    });
    this._composer.addSchemaMustHaveType(typeComposer);

    // Add the OrderDirection enum needed in subgraph plural queries.
    const orderDirectionEnum = new GraphQLEnumType({
      name: OrderDirection,
      values: {
        asc: {},
        desc: {}
      }
    });
    typeComposer = this._composer.createEnumTC(orderDirectionEnum);
    this._composer.addSchemaMustHaveType(typeComposer);

    // Add subgraph-schema entity queries to the schema composer.
    this._addSubgraphSchemaQueries(subgraphTypeDefs);
  }

  _addSubgraphSchemaQueries (subgraphTypeDefs: ReadonlyArray<DefinitionNode>): void {
    for (const subgraphTypeDef of subgraphTypeDefs) {
      // Filtering out enums.
      if (subgraphTypeDef.kind !== 'ObjectTypeDefinition') {
        continue;
      }

      const subgraphType = subgraphTypeDef.name.value;

      // Lowercase first letter for query name.
      const queryName = lowerCamelCase(subgraphType);

      const queryObject: { [key: string]: any; } = {};
      queryObject[queryName] = {
        // Get type composer object for return type from the schema composer.
        type: this._composer.getAnyTC(subgraphType),
        args: {
          id: 'ID!',
          block: BlockHeight
        }
      };

      // Add plural query

      // Create the subgraphType_orderBy enum type
      const subgraphTypeOrderByEnum = new GraphQLEnumType({
        name: `${subgraphType}_orderBy`,
        values: (subgraphTypeDef.fields || []).reduce((acc: any, field) => {
          acc[field.name.value] = {};
          return acc;
        }, {})
      });
      this._composer.addSchemaMustHaveType(subgraphTypeOrderByEnum);

      // Create plural query name
      // Append suffix 's' if pluralized name is the same as singular name (eg. PoolDayData)
      let pluralQueryName = pluralize(queryName);
      pluralQueryName = (pluralQueryName === queryName) ? `${pluralQueryName}s` : pluralQueryName;

      queryObject[pluralQueryName] = {
        // Get type composer object for return type from the schema composer.
        type: this._composer.getAnyTC(subgraphType).NonNull.List.NonNull,
        args: {
          block: BlockHeight,
          // TODO: Create input type for where clause
          // where: subgraphType_filter,
          orderBy: subgraphTypeOrderByEnum,
          orderDirection: OrderDirection,
          first: { type: GraphQLInt, defaultValue: 100 },
          skip: { type: GraphQLInt, defaultValue: 0 }
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

    // Create the Block type.
    typeComposer = this._composer.createObjectTC({
      name: '_Block_',
      fields: {
        cid: 'String',
        hash: 'String!',
        number: 'Int!',
        timestamp: 'Int!',
        parentHash: 'String!'
      }
    });
    this._composer.addSchemaMustHaveType(typeComposer);
  }

  /**
   * Adds Result types to the schema and typemapping.
   */
  _getOrCreateResultType (functionName: string, returnParameters: VariableDeclaration[]): ObjectTypeComposer<any, any> {
    const returnValueTypes = returnParameters.map((returnParameter) => {
      let typeName = returnParameter.typeName;
      assert(typeName);

      // Handle Mapping type for state variable queries
      while (typeName.type === 'Mapping') {
        typeName = typeName.valueType;
      }

      const isReturnTypeArray = isArrayType(typeName);
      const baseTypeName = getBaseType(typeName);
      assert(baseTypeName);

      const gqlReturnType = getGqlForSol(baseTypeName);

      return {
        type: gqlReturnType,
        isArray: isReturnTypeArray
      };
    });

    let objectTCName = 'Result';
    let value = '';

    if (returnParameters.length > 1) {
      const returnValueTypesMap = returnParameters.reduce((acc: {[key: string]: string}, _, index) => {
        const { type, isArray } = returnValueTypes[index];
        acc[`value${index}`] = (isArray) ? `[${type}!]!` : `${type}!`;
        return acc;
      }, {});

      const capitalizedFunctionName = `${functionName.charAt(0).toUpperCase()}${functionName.slice(1)}`;

      this._composer.getOrCreateOTC(
        `${capitalizedFunctionName}Type`,
        (tc) => {
          tc.addFields(returnValueTypesMap);
        }
      );

      objectTCName = objectTCName.concat(`${capitalizedFunctionName}Type`);
      value = `${capitalizedFunctionName}Type!`;
    } else {
      const { type, isArray } = returnValueTypes[0];
      value = (isArray) ? `[${type}!]!` : `${type}!`;
      objectTCName = objectTCName.concat(type);

      if (isArray) {
        objectTCName = objectTCName.concat('Array');
      }
    }

    const typeComposer = this._composer.getOrCreateOTC(
      objectTCName,
      (tc) => {
        tc.addFields({
          value,
          proof: () => this._composer.getOTC('Proof')
        });
      }
    );

    // Using this to declare result types before queries
    this._composer.addSchemaMustHaveType(typeComposer);

    return typeComposer;
  }

  _addGQLCacheTypes (): void {
    // Create a enum type composer to add enum CacheControlScope in the schema composer.
    const enumTypeComposer = this._composer.createEnumTC(`
      enum CacheControlScope {
        PUBLIC
        PRIVATE
      }
    `);
    this._composer.addSchemaMustHaveType(enumTypeComposer);

    // Add the directive cacheControl in the schema composer.
    this._composer.addDirective(new GraphQLDirective({
      name: 'cacheControl',
      locations: ['FIELD_DEFINITION', 'OBJECT', 'INTERFACE', 'UNION'],
      args: {
        maxAge: { type: GraphQLInt },
        inheritMaxAge: { type: GraphQLBoolean },
        scope: { type: enumTypeComposer.getType() }
      }
    }));
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
        type: this._composer.getOTC('ResultEvent').NonNull.List,
        args: {
          blockHash: 'String!',
          contractAddress: 'String!',
          name: 'String'
        }
      }
    });

    this._composer.Query.addFields({
      eventsInRange: {
        type: this._composer.getOTC('ResultEvent').NonNull.List,
        args: {
          fromBlockNumber: 'Int!',
          toBlockNumber: 'Int!'
        }
      }
    });
  }

  _addSyncStatus (): void {
    const typeComposer = this._composer.createObjectTC({
      name: 'SyncStatus',
      fields: {
        latestIndexedBlockHash: 'String!',
        latestIndexedBlockNumber: 'Int!',
        latestCanonicalBlockHash: 'String!',
        latestCanonicalBlockNumber: 'Int!'
      }
    });

    this._composer.addSchemaMustHaveType(typeComposer);

    this._composer.Query.addFields({
      getSyncStatus: {
        type: this._composer.getOTC('SyncStatus')
      }
    });
  }

  _addMeta (): void {
    // Create the Block type.
    const metaBlocktypeComposer = this._composer.createObjectTC({
      name: '_MetaBlock_',
      fields: {
        hash: 'Bytes',
        number: 'Int!',
        timestamp: 'Int'
      }
    });

    this._composer.addSchemaMustHaveType(metaBlocktypeComposer);

    const metaTypeComposer = this._composer.createObjectTC({
      name: '_Meta_',
      fields: {
        block: metaBlocktypeComposer.NonNull,
        deployment: { type: new GraphQLNonNull(GraphQLString) },
        hasIndexingErrors: { type: new GraphQLNonNull(GraphQLBoolean) }
      }
    });

    this._composer.addSchemaMustHaveType(metaTypeComposer);

    this._composer.Query.addFields({
      _meta: {
        type: this._composer.getOTC('_Meta_'),
        args: {
          block: BlockHeight
        }
      }
    });
  }

  _addStateType (): void {
    const typeComposer = this._composer.createObjectTC({
      name: 'ResultState',
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

  _addStateQuery (): void {
    this._composer.Query.addFields({
      getStateByCID: {
        type: this._composer.getOTC('ResultState'),
        args: {
          cid: 'String!'
        }
      }
    });

    this._composer.Query.addFields({
      getState: {
        type: this._composer.getOTC('ResultState'),
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

  _resolveEventConflict (name: string, params: Array<Param>): void {
    const eventTC = this._composer.getOTC(name);
    const currentFields = eventTC.getFieldNames();

    // Get the common fields.
    let commonFields: string[] = [];
    commonFields = params.reduce((acc, curr) => {
      if (currentFields.includes(curr.name)) {
        acc.push(curr.name);
      }
      return acc;
    }, commonFields);

    // Make the current fields that are uncommon nullable.
    currentFields.forEach((field: string) => {
      if (!commonFields.includes(field)) {
        eventTC.makeFieldNullable(field);
      }
    });

    // Get the new fields.
    const newFields: any = {};
    params.forEach((param: Param) => {
      if (!commonFields.includes(param.name)) {
        newFields[param.name] = `${getGqlForSol(param.type)}`;
      }
    });

    // Add the new fields to the current type.
    eventTC.addFields(newFields);
  }

  /**
   * Create GraphQL schema object type.
   * @param name
   * @param params
   */
  _createObjectType (name: string, params: Array<utils.ParamType>): ObjectTypeComposer {
    const typeObject: ObjectTypeComposerDefinition<any, any> = { name };

    if (params.length > 0) {
      typeObject.fields = params.reduce((acc: ObjectTypeComposerFieldConfigMapDefinition<any, any>, curr) => {
        acc[curr.name] = this._getObjectTypeField(curr);

        return acc;
      }, {});
    } else {
      // Types must define one or more fields.
      typeObject.fields = {
        dummy: 'String'
      };
    }

    // Create a type composer to add the required type in the schema composer.
    return this._composer.createObjectTC(typeObject);
  }

  /**
     * Get type of field in GraphQL schema for object types.
     * @param param
     */
  _getObjectTypeField (param: utils.ParamType): NonNullComposer<ObjectTypeComposer> | string | any[] {
    if (param.indexed && ['string', 'bytes', 'tuple', 'array'].includes(param.baseType)) {
      // Check for indexed reference type event params.
      param = utils.ParamType.fromObject({ type: 'bytes32', name: param.name });
    }

    // TODO: Get type name for tuple base types
    // ethers.utils gives both param.type and param.baseType as 'tuple', but doesn't give the actual type name
    // represented by 'internalType' field in the ABI
    // eg. "internalType": "struct Provider" or "internalType": "struct Task[]"
    if (param.baseType === 'tuple') {
      const typeName = param.name.charAt(0).toUpperCase() + param.name.slice(1);
      return this._createObjectType(typeName, param.components).NonNull;
    }

    if (param.baseType === 'array') {
      return [this._getObjectTypeField(param.arrayChildren)];
    }

    return `${getGqlForSol(param.type)}!`;
  }
}
