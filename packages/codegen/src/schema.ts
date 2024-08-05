//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import { GraphQLSchema, parse, printSchema, print, GraphQLDirective, GraphQLInt, GraphQLBoolean, GraphQLEnumType, DefinitionNode, GraphQLString, GraphQLNonNull } from 'graphql';
import { ObjectTypeComposer, NonNullComposer, ObjectTypeComposerDefinition, ObjectTypeComposerFieldConfigMapDefinition, SchemaComposer, ListComposer, ComposeOutputType, ThunkComposer } from 'graphql-compose';
import { Writable } from 'stream';
import { utils } from 'ethers';
import { VariableDeclaration } from '@solidity-parser/parser/dist/src/ast-types';
import pluralize from 'pluralize';

import { getGqlForSol } from './utils/type-mappings';
import { Param } from './utils/types';
import { getBaseType, isArrayType, lowerCamelCase } from './utils/helpers';

const ORDER_DIRECTION = 'OrderDirection';
const BLOCK_HEIGHT = 'Block_height';
const BLOCK_CHANGED_FILTER = 'BlockChangedFilter';

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
    let inputTypeComposer = this._composer.createInputTC({
      name: BLOCK_HEIGHT,
      fields: {
        hash: 'Bytes',
        number: 'Int'
      }
    });
    this._composer.addSchemaMustHaveType(inputTypeComposer);

    // Add the BlockChangedFilter input needed in subgraph queries.
    inputTypeComposer = this._composer.createInputTC({
      name: BLOCK_CHANGED_FILTER,
      fields: {
        number_gte: 'Int!'
      }
    });
    this._composer.addSchemaMustHaveType(inputTypeComposer);

    // Add the OrderDirection enum needed in subgraph plural queries.
    const orderDirectionEnum = new GraphQLEnumType({
      name: ORDER_DIRECTION,
      values: {
        asc: {},
        desc: {}
      }
    });
    const enumTypeComposer = this._composer.createEnumTC(orderDirectionEnum);
    this._composer.addSchemaMustHaveType(enumTypeComposer);

    // Add subgraph-schema entity queries to the schema composer.
    this._addSubgraphSchemaQueries(subgraphTypeDefs);

    // Add type and query for meta data
    this._addMeta();
  }

  _addSubgraphSchemaQueries (subgraphTypeDefs: ReadonlyArray<DefinitionNode>): void {
    const subgraphTypeArgsMap = new Map<string, { [key: string]: any }>();

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
          block: BLOCK_HEIGHT
        }
      };

      // Add plural query

      const subgraphTypeComposer = this._composer.getOTC(subgraphType);
      const subgraphTypeFields = subgraphTypeComposer.getFields();

      // Create the subgraphType_orderBy enum type
      const subgraphTypeOrderByEnum = new GraphQLEnumType({
        name: `${subgraphType}_orderBy`,
        values: (subgraphTypeDef.fields || []).reduce((acc: any, field) => {
          acc[field.name.value] = {};

          const subgraphTypeField = subgraphTypeComposer.getField(field.name.value);
          const { isArray, isRelation, entityType } = this._getDetailsForSubgraphField(subgraphTypeField.type);

          if (!isArray && isRelation) {
            assert(entityType);
            this._fillOrderByWithNestedFields(acc, entityType, field.name.value);
          }

          return acc;
        }, {})
      });
      this._composer.addSchemaMustHaveType(subgraphTypeOrderByEnum);

      // Create the subgraphType_filter input type
      const subgraphTypeFilterComposer = this._composer.createInputTC({
        name: `${subgraphType}_filter`,
        // Add fields to filter input based on entity properties
        fields: Object.entries(subgraphTypeFields).reduce((acc: {[key: string]: string}, [fieldName, field]) => {
          const { type: fieldType, isArray, isRelation, entityType } = this._getDetailsForSubgraphField(field.type);
          acc[fieldName] = fieldType;
          acc[`${fieldName}_not`] = acc[fieldName];

          if (!isArray) {
            acc[`${fieldName}_gt`] = acc[fieldName];
            acc[`${fieldName}_lt`] = acc[fieldName];
            acc[`${fieldName}_gte`] = acc[fieldName];
            acc[`${fieldName}_lte`] = acc[fieldName];
            acc[`${fieldName}_in`] = `[${acc[fieldName]}!]`;
            acc[`${fieldName}_not_in`] = `[${acc[fieldName]}!]`;

            if (acc[fieldName] === 'String') {
              acc[`${fieldName}_starts_with`] = acc[fieldName];
              acc[`${fieldName}_starts_with_nocase`] = acc[fieldName];
              acc[`${fieldName}_not_starts_with`] = acc[fieldName];
              acc[`${fieldName}_not_starts_with_nocase`] = acc[fieldName];
              acc[`${fieldName}_ends_with`] = acc[fieldName];
              acc[`${fieldName}_ends_with_nocase`] = acc[fieldName];
              acc[`${fieldName}_not_ends_with`] = acc[fieldName];
              acc[`${fieldName}_not_ends_with_nocase`] = acc[fieldName];
            }
          }

          if (isArray || acc[fieldName].includes('String') || acc[fieldName].includes('Bytes')) {
            acc[`${fieldName}_contains`] = acc[fieldName];
            acc[`${fieldName}_not_contains`] = acc[fieldName];
          }

          if (isArray || acc[fieldName].includes('String')) {
            acc[`${fieldName}_contains_nocase`] = acc[fieldName];
            acc[`${fieldName}_not_contains_nocase`] = acc[fieldName];
          }

          // Check if field is a relation type
          if (isRelation) {
            // Nested filter for relation field
            acc[`${fieldName}_`] = `${entityType}_filter`;

            // Remove filters if it is a derived field
            if (field.directives && field.directives.some(directive => directive.name === 'derivedFrom')) {
              delete acc[`${fieldName}`];
              delete acc[`${fieldName}_not`];
              delete acc[`${fieldName}_contains`];
              delete acc[`${fieldName}_contains_nocase`];
              delete acc[`${fieldName}_not_contains`];
              delete acc[`${fieldName}_not_contains_nocase`];
            }
          }

          return acc;
        }, {})
      });
      subgraphTypeFilterComposer.setField('_change_block', BLOCK_CHANGED_FILTER);
      subgraphTypeFilterComposer.setField('and', `[${subgraphType}_filter]`);
      subgraphTypeFilterComposer.setField('or', `[${subgraphType}_filter]`);

      this._composer.addSchemaMustHaveType(subgraphTypeFilterComposer);

      // Create plural query name
      // Append suffix 's' if pluralized name is the same as singular name (eg. PoolDayData)
      let pluralQueryName = pluralize(queryName);
      pluralQueryName = (pluralQueryName === queryName) ? `${pluralQueryName}s` : pluralQueryName;

      const queryArgs = {
        where: `${subgraphType}_filter`,
        orderBy: subgraphTypeOrderByEnum,
        orderDirection: ORDER_DIRECTION,
        first: { type: GraphQLInt, defaultValue: 100 },
        skip: { type: GraphQLInt, defaultValue: 0 }
      };

      queryObject[pluralQueryName] = {
        // Get type composer object for return type from the schema composer.
        type: this._composer.getAnyTC(subgraphType).NonNull.List.NonNull,
        args: {
          block: BLOCK_HEIGHT,
          ...queryArgs
        }
      };
      this._composer.Query.addFields(queryObject);

      // Save the args for this type in a map (type -> args) for further usage.
      subgraphTypeArgsMap.set(subgraphType, queryArgs);
    }

    // Add args on plural fields for subgraph types.
    this._addSubgraphPluralFieldArgs(subgraphTypeDefs, subgraphTypeArgsMap);
  }

  _getDetailsForSubgraphField (fieldType: ComposeOutputType<any>): {
    type: string;
    isArray: boolean;
    isRelation: boolean;
    entityType?: string;
  } {
    let type = fieldType.getTypeName();
    let isArray = false;
    let isRelation = false;
    let entityType: string | undefined;

    if (fieldType instanceof NonNullComposer) {
      const unwrappedFieldType = fieldType.getUnwrappedTC() as ObjectTypeComposer;

      if (fieldType.ofType instanceof ListComposer) {
        isArray = true;
      }

      ({ type, isRelation, entityType } = this._getDetailsForSubgraphField(unwrappedFieldType));
    }

    if (fieldType instanceof ListComposer) {
      const childFieldType = fieldType.getUnwrappedTC() as ObjectTypeComposer;
      ({ type, isRelation, entityType } = this._getDetailsForSubgraphField(childFieldType));

      isArray = true;
    }

    if (fieldType instanceof ThunkComposer) {
      const unwrappedFieldType = fieldType.getUnwrappedTC() as ObjectTypeComposer;
      ({ type, isRelation, entityType } = this._getDetailsForSubgraphField(unwrappedFieldType));
    }

    if (fieldType instanceof ObjectTypeComposer) {
      type = 'String';
      isRelation = true;
      entityType = fieldType.getTypeName();
    }

    if (isArray) {
      type = `[${type}!]`;
    }

    return { type, isArray, isRelation, entityType };
  }

  _fillOrderByWithNestedFields (orderByFields: {[key: string]: any}, entityName: string, fieldName: string): void {
    const subgraphTypeComposer = this._composer.getOTC(entityName);
    const subgraphTypeFields = subgraphTypeComposer.getFields();

    Object.entries(subgraphTypeFields)
      .filter(([, field]) => {
        // Avoid nested ordering on array / relational / derived type fields
        const { isRelation, isArray } = this._getDetailsForSubgraphField(field.type);
        return !isRelation && !isArray;
      })
      .forEach(([name]) => {
        orderByFields[`${fieldName}__${name}`] = {};
      });
  }

  _addSubgraphPluralFieldArgs (subgraphTypeDefs: ReadonlyArray<DefinitionNode>, subgraphTypeArgsMap: Map<string, { [key: string]: any }>): void {
    for (const subgraphTypeDef of subgraphTypeDefs) {
      // Filtering out enums.
      if (subgraphTypeDef.kind !== 'ObjectTypeDefinition') {
        continue;
      }

      const subgraphType = subgraphTypeDef.name.value;
      const subgraphTypeComposer = this._composer.getOTC(subgraphType);

      // Process each field on the type.
      Object.entries(subgraphTypeComposer.getFields()).forEach(([fieldName, field]) => {
        const { isArray, entityType } = this._getDetailsForSubgraphField(field.type);

        // Set args if it's a plural field of some entity type.
        if (entityType && isArray) {
          subgraphTypeComposer.setFieldArgs(fieldName, subgraphTypeArgsMap.get(entityType) || {});
        }
      });
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
        latestCanonicalBlockNumber: 'Int!',
        initialIndexedBlockHash: 'String!',
        initialIndexedBlockNumber: 'Int!',
        latestProcessedBlockHash: 'String!',
        latestProcessedBlockNumber: 'Int!'
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
          block: BLOCK_HEIGHT
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
