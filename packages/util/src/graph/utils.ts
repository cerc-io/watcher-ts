import debug from 'debug';
import { Between, DeepPartial, EntityTarget, InsertEvent, Repository, UpdateEvent, ValueTransformer } from 'typeorm';
import { ColumnMetadata } from 'typeorm/metadata/ColumnMetadata';
import assert from 'assert';
import _ from 'lodash';

import { IndexerInterface, StateInterface } from '../types';
import { jsonBigIntStringReplacer } from '../misc';
import { GraphDecimal } from './graph-decimal';
import { GraphDatabase } from './database';
import { TypeId, ValueKind } from './types';

const log = debug('vulcanize:utils');

export interface Block {
  headerId: number;
  blockHash: string;
  blockNumber: string;
  timestamp: string;
  parentHash: string;
  stateRoot: string;
  td: string;
  txRoot: string;
  receiptRoot: string;
  uncleHash: string;
  difficulty: string;
  gasLimit: string;
  gasUsed: string;
  author: string;
  size: string;
  baseFee?: string;
}

export const toEntityValue = async (instanceExports: any, entityInstance: any, data: any, field: ColumnMetadata, type: string) => {
  const { __newString, Value } = instanceExports;
  const { isArray, propertyName, isNullable } = field;

  const entityKey = await __newString(propertyName);
  const entityValuePtr = await entityInstance.get(entityKey);
  const subgraphValue = Value.wrap(entityValuePtr);
  const value = data[propertyName];

  // Check if the entity property is nullable.
  // No need to set the property if the value is null as well.
  if (isNullable && value === null) {
    return;
  }

  const entityValue = await formatEntityValue(instanceExports, subgraphValue, type, value, isArray);

  return entityInstance.set(entityKey, entityValue);
};

export const fromEntityValue = async (instanceExports: any, entityInstance: any, key: string): Promise<any> => {
  const { __newString } = instanceExports;
  const entityKey = await __newString(key);
  const entityValuePtr = await entityInstance.get(entityKey);

  return parseEntityValue(instanceExports, entityValuePtr);
};

const parseEntityValue = async (instanceExports: any, valuePtr: number) => {
  const {
    __getString,
    __getArray,
    BigInt: ASBigInt,
    Bytes,
    BigDecimal,
    Value
  } = instanceExports;

  const value = Value.wrap(valuePtr);
  const kind = await value.kind;

  switch (kind) {
    case ValueKind.STRING: {
      const stringValue = await value.toString();
      return __getString(stringValue);
    }

    case ValueKind.BYTES: {
      const bytesPtr = await value.toBytes();
      const bytes = await Bytes.wrap(bytesPtr);
      const bytesStringPtr = await bytes.toHexString();

      return __getString(bytesStringPtr);
    }

    case ValueKind.BOOL: {
      const bool = await value.toBoolean();

      return Boolean(bool);
    }

    case ValueKind.INT: {
      return value.toI32();
    }

    case ValueKind.BIGINT: {
      const bigIntPtr = await value.toBigInt();
      const bigInt = ASBigInt.wrap(bigIntPtr);
      const bigIntStringPtr = await bigInt.toString();
      const bigIntString = __getString(bigIntStringPtr);

      return BigInt(bigIntString);
    }

    case ValueKind.BIGDECIMAL: {
      const bigDecimalPtr = await value.toBigDecimal();
      const bigDecimal = BigDecimal.wrap(bigDecimalPtr);
      const bigDecimalStringPtr = await bigDecimal.toString();

      return new GraphDecimal(__getString(bigDecimalStringPtr)).toFixed();
    }

    case ValueKind.ARRAY: {
      const arrayPtr = await value.toArray();
      const arr = await __getArray(arrayPtr);
      const arrDataPromises = arr.map((arrValuePtr: any) => parseEntityValue(instanceExports, arrValuePtr));

      return Promise.all(arrDataPromises);
    }

    case ValueKind.NULL: {
      return null;
    }

    default:
      throw new Error(`Unsupported value kind: ${kind}`);
  }
};

const formatEntityValue = async (instanceExports: any, subgraphValue: any, type: string, value: any, isArray: boolean): Promise<any> => {
  const { __newString, __newArray, BigInt: ASBigInt, Value, ByteArray, Bytes, BigDecimal, id_of_type: getIdOfType } = instanceExports;

  if (isArray) {
    const dataArrayPromises = value.map((el: any) => formatEntityValue(instanceExports, subgraphValue, type, el, false));
    const dataArray = await Promise.all(dataArrayPromises);
    const arrayStoreValueId = await getIdOfType(TypeId.ArrayStoreValue);
    const valueArray = await __newArray(arrayStoreValueId, dataArray);

    return Value.fromArray(valueArray);
  }

  switch (type) {
    case 'ID':
    case 'String': {
      const entityValue = await __newString(value);

      return Value.fromString(entityValue);
    }

    case 'Boolean': {
      return Value.fromBoolean(value ? 1 : 0);
    }

    case 'Int': {
      return Value.fromI32(value);
    }

    case 'BigInt': {
      const valueStringPtr = await __newString(value.toString());
      const bigInt = await ASBigInt.fromString(valueStringPtr);

      return Value.fromBigInt(bigInt);
    }

    case 'BigDecimal': {
      const valueStringPtr = await __newString(value.toString());
      const bigDecimal = await BigDecimal.fromString(valueStringPtr);

      return Value.fromBigDecimal(bigDecimal);
    }

    case 'Bytes': {
      const entityValue = await __newString(value);
      const byteArray = await ByteArray.fromHexString(entityValue);
      const bytes = await Bytes.fromByteArray(byteArray);

      return Value.fromBytes(bytes);
    }

    // Return default as string for enum or custom type.
    default: {
      const entityValue = await __newString(value);

      return Value.fromString(entityValue);
    }
  }
};

export const resolveEntityFieldConflicts = (entity: any): any => {
  if (entity) {
    // Remove fields blockHash and blockNumber from the entity.
    delete entity.blockHash;
    delete entity.blockNumber;

    // Rename _blockHash -> blockHash.
    if ('_blockHash' in entity) {
      entity.blockHash = entity._blockHash;
      delete entity._blockHash;
    }

    // Rename _blockNumber -> blockNumber.
    if ('_blockNumber' in entity) {
      entity.blockNumber = entity._blockNumber;
      delete entity._blockNumber;
    }
  }

  return entity;
};

export const prepareEntityState = (updatedEntity: any, entityName: string, relationsMap: Map<any, { [key: string]: any }>): any => {
  // Resolve any field name conflicts in the dbData for auto-diff.
  updatedEntity = resolveEntityFieldConflicts(updatedEntity);

  // Prepare the diff data.
  const diffData: any = { state: {} };

  const result = Array.from(relationsMap.entries())
    .find(([key]) => key.name === entityName);

  if (result) {
    // Update entity data if relations exist.
    const [_, relations] = result;

    // Update relation fields for diff data to be similar to GQL query entities.
    Object.entries(relations).forEach(([relation, { isArray, isDerived }]) => {
      if (isDerived || !updatedEntity[relation]) {
        // Field is not present in dbData for derived relations
        return;
      }

      if (isArray) {
        updatedEntity[relation] = updatedEntity[relation].map((id: string) => ({ id }));
      } else {
        updatedEntity[relation] = { id: updatedEntity[relation] };
      }
    });
  }

  // JSON stringify and parse data for handling unknown types when encoding.
  // For example, decimal.js values are converted to string in the diff data.
  diffData.state[entityName] = {
    // Using custom replacer to store bigints as string values to be encoded by IPLD dag-cbor.
    // TODO: Parse and store as native bigint by using Type encoders in IPLD dag-cbor encode.
    // https://github.com/rvagg/cborg#type-encoders
    [updatedEntity.id]: JSON.parse(JSON.stringify(updatedEntity, jsonBigIntStringReplacer))
  };

  return diffData;
};

export const fromStateEntityValues = (
  stateEntity: any,
  propertyName: string,
  relations: { [key: string]: any } = {},
  transformer?: ValueTransformer | ValueTransformer[]
): any => {
  // Parse DB data value from state entity data.
  if (relations) {
    const relation = relations[propertyName];

    if (relation) {
      if (relation.isArray) {
        return stateEntity[propertyName].map((relatedEntity: { id: string }) => relatedEntity.id);
      } else {
        return stateEntity[propertyName]?.id;
      }
    }
  }

  if (transformer) {
    if (Array.isArray(transformer)) {
      // Apply transformer in reverse order similar to when reading from DB.
      return transformer.reduceRight((acc, elTransformer) => {
        return elTransformer.from(acc);
      }, stateEntity[propertyName]);
    }

    return transformer.from(stateEntity[propertyName]);
  }

  return stateEntity[propertyName];
};

export const updateEntitiesFromState = async (database: GraphDatabase, indexer: IndexerInterface, state: StateInterface) => {
  const data = indexer.getStateData(state);

  // Get relations for subgraph entity
  assert(indexer.getRelationsMap);
  const relationsMap = indexer.getRelationsMap();

  for (const [entityName, entities] of Object.entries(data.state)) {
    const result = Array.from(relationsMap.entries())
      .find(([key]) => key.name === entityName);

    const relations = result ? result[1] : {};

    log(`Updating entities from State for entity ${entityName}`);
    console.time(`time:watcher#GraphWatcher-updateEntitiesFromState-update-entity-${entityName}`);
    for (const [id, entityData] of Object.entries(entities as any)) {
      const dbData = database.fromState(state.block, entityName, entityData, relations);
      await database.saveEntity(entityName, dbData);
    }
    console.timeEnd(`time:watcher#GraphWatcher-updateEntitiesFromState-update-entity-${entityName}`);
  }
};

export const afterEntityInsertOrUpdate = async<Entity> (
  frothyEntityType: EntityTarget<Entity>,
  entities: Set<any>,
  event: InsertEvent<any> | UpdateEvent<any>,
  entityToLatestEntityMap: Map<new () => any, new () => any> = new Map()
): Promise<void> => {
  const entity = event.entity;

  // Return if the entity is being pruned
  if (entity.isPruned) {
    return;
  }

  // Insert the entity details in FrothyEntity table
  if (entities.has(entity.constructor)) {
    const frothyEntity = event.manager.create(
      frothyEntityType,
      {
        ..._.pick(entity, ['id', 'blockHash', 'blockNumber']),
        ...{ name: entity.constructor.name }
      }
    );

    await event.manager.createQueryBuilder()
      .insert()
      .into(frothyEntityType)
      .values(frothyEntity as any)
      .orIgnore()
      .execute();
  }

  // Get latest entity's type
  const entityTarget = entityToLatestEntityMap.get(entity.constructor);

  if (!entityTarget) {
    return;
  }

  // Get latest entity's fields to be updated
  const latestEntityRepo = event.manager.getRepository(entityTarget);
  const fieldsToUpdate = latestEntityRepo.metadata.columns.map(column => column.databaseName).filter(val => val !== 'id');

  // Create a latest entity instance and upsert in the db
  const latestEntity = getLatestEntityFromEntity(latestEntityRepo, entity);
  await event.manager.createQueryBuilder()
    .insert()
    .into(entityTarget)
    .values(latestEntity)
    .orUpdate(
      { conflict_target: ['id'], overwrite: fieldsToUpdate }
    )
    .execute();
};

export function getLatestEntityFromEntity<Entity> (latestEntityRepo: Repository<Entity>, entity: any): Entity {
  const latestEntityFields = latestEntityRepo.metadata.columns.map(column => column.propertyName);
  return latestEntityRepo.create(_.pick(entity, latestEntityFields) as DeepPartial<Entity>);
}

export const fillState = async (
  indexer: IndexerInterface,
  contractEntitiesMap: Map<string, string[]>,
  argv: {
    startBlock: number,
    endBlock: number
  }
): Promise<void> => {
  const { startBlock, endBlock } = argv;
  if (startBlock > endBlock) {
    log('endBlock should be greater than or equal to startBlock');
    process.exit(1);
  }

  // Check that there are no existing diffs in this range
  const existingStates = await indexer.getStates({ block: { blockNumber: Between(startBlock, endBlock) } });
  if (existingStates.length > 0) {
    log('found existing state(s) in the given range');
    process.exit(1);
  }

  console.time('time:fill-state');

  // Fill state for blocks in the given range
  for (let blockNumber = startBlock; blockNumber <= endBlock; blockNumber++) {
    console.time(`time:fill-state-${blockNumber}`);

    // Get the canonical block hash at current height
    const blocks = await indexer.getBlocksAtHeight(blockNumber, false);

    if (blocks.length === 0) {
      log(`block not found at height ${blockNumber}`);
      process.exit(1);
    } else if (blocks.length > 1) {
      log(`found more than one non-pruned block at height ${blockNumber}`);
      process.exit(1);
    }

    const blockHash = blocks[0].blockHash;

    // Create initial state for contracts
    assert(indexer.createInit);
    await indexer.createInit(blockHash, blockNumber);

    // Fill state for each contract in contractEntitiesMap
    const contractStatePromises = Array.from(contractEntitiesMap.entries())
      .map(async ([contractAddress, entities]): Promise<void> => {
        // Get all the updated entities at this block
        const updatedEntitiesListPromises = entities.map(async (entity): Promise<any[]> => {
          return indexer.getEntitiesForBlock(blockHash, entity);
        });
        const updatedEntitiesList = await Promise.all(updatedEntitiesListPromises);

        // Populate state with all the updated entities of each entity type
        updatedEntitiesList.forEach((updatedEntities, index) => {
          const entityName = entities[index];

          updatedEntities.forEach((updatedEntity) => {
            assert(indexer.getRelationsMap);
            assert(indexer.updateSubgraphState);

            // Prepare diff data for the entity update
            const diffData = prepareEntityState(updatedEntity, entityName, indexer.getRelationsMap());

            // Update the in-memory subgraph state
            indexer.updateSubgraphState(contractAddress, diffData);
          });
        });
      });

    await Promise.all(contractStatePromises);

    // Persist subgraph state to the DB
    assert(indexer.dumpSubgraphState);
    await indexer.dumpSubgraphState(blockHash, true);
    await indexer.updateStateSyncStatusIndexedBlock(blockNumber);

    // Create checkpoints
    await indexer.processCheckpoint(blockHash);
    await indexer.updateStateSyncStatusCheckpointBlock(blockNumber);

    console.timeEnd(`time:fill-state-${blockNumber}`);
  }

  console.timeEnd('time:fill-state');
};
