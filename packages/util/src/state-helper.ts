import _ from 'lodash';
import debug from 'debug';
// @ts-expect-error https://github.com/microsoft/TypeScript/issues/49721#issuecomment-1319854183
import type { CID as CIDType } from 'multiformats/cid';

// @ts-expect-error TODO: Resolve (Not able to find the type declarations)
import * as codec from '@ipld/dag-cbor';

import { BlockProgressInterface, GraphDatabaseInterface, StateInterface, StateKind } from './types';
import { jsonBigIntStringReplacer } from './misc';
import { ResultState } from './indexer';

const log = debug('vulcanize:state-helper');

export interface StateDataMeta {
  id: string
  kind: StateKind
  parent: {
    '/': string | null
  },
  ethBlock: {
    cid: {
      '/': string
    },
    num: number
  }
}

interface StateData {
  meta?: StateDataMeta;
  state: any
}

export const updateStateForElementaryType = (initialObject: any, stateVariable: string, value: any): any => {
  const object = _.cloneDeep(initialObject);
  const path = ['state', stateVariable];

  return _.set(object, path, value);
};

export const updateStateForMappingType = (initialObject: any, stateVariable: string, keys: string[], value: any): any => {
  const object = _.cloneDeep(initialObject);
  keys.unshift('state', stateVariable);

  // Use _.setWith() with Object as customizer as _.set() treats numeric value in path as an index to an array.
  return _.setWith(object, keys, value, Object);
};

export const verifyCheckpointData = async (database: GraphDatabaseInterface, block: BlockProgressInterface, data: any): Promise<void> => {
  const { state } = data;

  for (const [entityName, idEntityMap] of Object.entries(state)) {
    for (const [id, stateEntity] of Object.entries(idEntityMap as {[key: string]: any})) {
      const entityData = await database.getEntity(entityName, id, block.blockHash) as any;

      // Compare entities.
      const diffFound = Object.keys(stateEntity)
        .some(key => {
          let stateValue = stateEntity[key];

          if (key === 'blockNumber') {
            entityData.blockNumber = entityData._blockNumber;
          }

          if (key === 'blockHash') {
            entityData.blockHash = entityData._blockHash;
          }

          if (typeof stateEntity[key] === 'object' && stateEntity[key]?.id) {
            stateValue = stateEntity[key].id;
          }

          if (
            Array.isArray(stateEntity[key]) &&
            stateEntity[key].length &&
            stateEntity[key][0].id
          ) {
            // Map State entity 1 to N relation field array to match DB entity.
            stateValue = stateEntity[key].map(({ id }: { id: string }) => id);

            // Sort DB entity 1 to N relation field array.
            entityData[key] = entityData[key].sort((a: string, b: string) => a.localeCompare(b));
          }

          return JSON.stringify(stateValue) !== JSON.stringify(entityData[key], jsonBigIntStringReplacer);
        });

      if (diffFound) {
        const message = `Diff found for checkpoint at block ${block.blockNumber} in entity ${entityName} id ${id}`;
        log(message);
        throw new Error(message);
      }
    }
  }
};

export const getResultState = (state: StateInterface): ResultState => {
  const block = state.block;

  const data = codec.decode(Buffer.from(state.data)) as any;

  return {
    block: {
      cid: block.cid,
      hash: block.blockHash,
      number: block.blockNumber,
      timestamp: block.blockTimestamp,
      parentHash: block.parentHash
    },
    contractAddress: state.contractAddress,
    cid: state.cid,
    kind: state.kind,
    data: JSON.stringify(data)
  };
};

export const createOrUpdateStateData = async (
  data: StateData,
  meta?: StateDataMeta
): Promise<{ cid: CIDType, data: StateData, bytes: codec.ByteView<StateData> }> => {
  if (meta) {
    data.meta = meta;
  }

  // Encoding the data using dag-cbor codec.
  const bytes = codec.encode(data);

  const { sha256 } = await import('multiformats/hashes/sha2');

  // Calculating sha256 (multi)hash of the encoded data.
  const hash = await sha256.digest(bytes);

  const { CID } = await import('multiformats/cid');

  // Calculating the CID: v1, code: dag-cbor, hash.
  const cid = CID.create(1, codec.code, hash);

  return { cid, data, bytes };
};
