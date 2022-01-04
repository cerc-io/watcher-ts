//
// Copyright 2021 Vulcanize, Inc.
//

import path from 'path';
import chai, { assert, expect } from 'chai';
import spies from 'chai-spies';
import { utils } from 'ethers';

import { BaseProvider } from '@ethersproject/providers';

import { getDummyEventData, getDummyGraphData, getTestDatabase, getTestIndexer, getTestProvider } from '../test/utils';
import abi from '../test/subgraph/example1/build/Example1/abis/Example1.json';
import { instantiate } from './loader';
import { createEvent, createBlock, Block, EventData } from './utils';
import { Database } from './database';
import { Indexer } from '../test/utils/indexer';

chai.use(spies);

const sandbox = chai.spy.sandbox();

describe('call handler in mapping code', () => {
  let exports: any;
  let db: Database;
  let indexer: Indexer;
  let provider: BaseProvider;

  let dummyEventData: EventData;
  let dummyGraphData: any;

  before(async () => {
    db = getTestDatabase();
    indexer = getTestIndexer();
    provider = getTestProvider();

    // Create dummy test data.
    dummyEventData = await getDummyEventData();
    dummyGraphData = getDummyGraphData();

    sandbox.on(indexer, 'createDiffStaged', (contractAddress: string, blockHash: string, data: any) => {
      assert(contractAddress);
      assert(blockHash);
      assert(data);
    });

    sandbox.on(db, 'getEntity', (blockHash: string, entityString: string, idString: string) => {
      assert(blockHash);
      assert(entityString);
      assert(idString);
    });

    sandbox.on(db, 'fromGraphEntity', async (instanceExports: any, block: Block, entity: string, entityInstance: any) => {
      assert(instanceExports);
      assert(block);
      assert(entity);
      assert(entityInstance);

      return {};
    });

    sandbox.on(db, 'saveEntity', (entity: string, data: any) => {
      assert(entity);
      assert(data);
    });
  });

  it('should load the subgraph example wasm', async () => {
    const filePath = path.resolve(__dirname, '../test/subgraph/example1/build/Example1/Example1.wasm');
    const instance = await instantiate(
      db,
      indexer,
      provider,
      {
        block: dummyEventData.block,
        event: {
          contract: dummyGraphData.dataSource.address
        }
      },
      filePath,
      dummyGraphData
    );
    exports = instance.exports;
    const { _start } = exports;

    // Important to call _start for built subgraphs on instantiation!
    // TODO: Check api version https://github.com/graphprotocol/graph-node/blob/6098daa8955bdfac597cec87080af5449807e874/runtime/wasm/src/module/mod.rs#L533
    _start();
  });

  it('should execute the event handler function', async () => {
    const { handleTest } = exports;

    // Create event params data.
    const contractInterface = new utils.Interface(abi);
    const eventFragment = contractInterface.getEvent('Test(string,uint8,uint256)');
    dummyEventData.inputs = eventFragment.inputs;

    dummyEventData.event = {
      param1: 'abc',
      param2: BigInt(150),
      param3: BigInt(564894232132154)
    };

    // Dummy contract address string.
    const contractAddress = '0xCA6D29232D1435D8198E3E5302495417dD073d61';

    // Create an ethereum event Test to be passed to handler.
    const test = await createEvent(exports, contractAddress, dummyEventData);

    await handleTest(test);

    expect(db.getEntity).to.have.been.called();
    expect(db.fromGraphEntity).to.have.been.called();
    expect(db.saveEntity).to.have.been.called();
    expect(indexer.createDiffStaged).to.have.been.called();
  });

  it('should execute the block handler function', async () => {
    const { handleBlock } = exports;
    const blockData = dummyEventData.block;

    // Create an ethereum block to be passed to the handler.
    const block = await createBlock(exports, blockData);

    await handleBlock(block);
  });

  after(() => {
    sandbox.restore();
  });
});
