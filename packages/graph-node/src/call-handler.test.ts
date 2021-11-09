//
// Copyright 2021 Vulcanize, Inc.
//

import path from 'path';
import chai, { assert, expect } from 'chai';
import spies from 'chai-spies';

import { getDummyEventData, getTestDatabase } from '../test/utils';
import { instantiate } from './loader';
import { createEvent, Block } from './utils';
import { Database } from './database';

chai.use(spies);

const sandbox = chai.spy.sandbox();

describe('call handler in mapping code', () => {
  let exports: any;
  let db: Database;

  const eventData = getDummyEventData();

  before(async () => {
    db = await getTestDatabase();

    sandbox.on(db, 'getEntity', (blockHash: string, entityString: string, idString: string) => {
      assert(blockHash);
      assert(entityString);
      assert(idString);
    });

    sandbox.on(db, 'fromGraphEntity', async (instanceExports: any, block: Block, entity: string, entityInstance: any) => {
      const entityFields = [
        { type: 'varchar', propertyName: 'blockHash' },
        { type: 'integer', propertyName: 'blockNumber' },
        { type: 'bigint', propertyName: 'count' },
        { type: 'varchar', propertyName: 'param1' },
        { type: 'integer', propertyName: 'param2' }
      ];

      return db.getEntityValues(instanceExports, block, entityInstance, entityFields);
    });

    sandbox.on(db, 'saveEntity', (entity: string, data: any) => {
      assert(entity);
      assert(data);
    });
  });

  it('should load the subgraph example wasm', async () => {
    const filePath = path.resolve(__dirname, '../test/subgraph/example1/build/Example1/Example1.wasm');
    const instance = await instantiate(db, { event: { block: eventData.block } }, filePath);
    exports = instance.exports;
  });

  it('should execute the handler function', async () => {
    const {
      _start,
      handleTest
    } = exports;

    // Important to call _start for built subgraphs on instantiation!
    // TODO: Check api version https://github.com/graphprotocol/graph-node/blob/6098daa8955bdfac597cec87080af5449807e874/runtime/wasm/src/module/mod.rs#L533
    _start();

    // Create event params data.
    eventData.eventParams = [
      {
        name: 'param1',
        value: 'abc',
        kind: 'string'
      },
      {
        name: 'param2',
        value: BigInt(123),
        kind: 'uint256'
      }
    ];

    // Dummy contract address string.
    const contractAddress = '0xCA6D29232D1435D8198E3E5302495417dD073d61';

    // Create Test event to be passed to handler.
    const test = await createEvent(exports, contractAddress, eventData);

    await handleTest(test);

    expect(db.getEntity).to.have.been.called();
    expect(db.fromGraphEntity).to.have.been.called();
    expect(db.saveEntity).to.have.been.called();
  });

  after(() => {
    sandbox.restore();
  });
});
