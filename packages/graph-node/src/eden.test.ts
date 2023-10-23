//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import { ethers, utils } from 'ethers';
import path from 'path';
import chai from 'chai';
import spies from 'chai-spies';

import { BaseProvider } from '@ethersproject/providers';
import { GraphDatabase, createEvent, Block, createBlock, EventData } from '@cerc-io/util';

import { instantiate } from './loader';
import edenNetworkAbi from '../test/subgraph/eden/EdenNetwork/abis/EdenNetwork.json';
import merkleDistributorAbi from '../test/subgraph/eden/EdenNetworkDistribution/abis/MerkleDistributor.json';
import distributorGovernanceAbi from '../test/subgraph/eden/EdenNetworkGovernance/abis/DistributorGovernance.json';
import { getDummyEventData, getTestDatabase, getTestIndexer, getTestProvider } from '../test/utils';
import { Indexer } from '../test/utils/indexer';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

chai.use(spies);

const sandbox = chai.spy.sandbox();

xdescribe('eden wasm loader tests', async () => {
  let db: GraphDatabase;
  let indexer: Indexer;
  let provider: BaseProvider;

  let dummyEventData: EventData;

  before(async () => {
    db = getTestDatabase();
    indexer = getTestIndexer();
    provider = getTestProvider();

    // Create dummy test data.
    dummyEventData = await getDummyEventData();

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
      const entityFields: any = [];

      return db.getEntityValues(instanceExports, block, entityInstance, entityFields);
    });

    sandbox.on(db, 'saveEntity', (entity: string, data: any) => {
      assert(entity);
      assert(data);
    });
  });

  describe('EdenNetwork wasm', () => {
    let exports: any;

    // EdenNetwork contract address string.
    const contractAddress = process.env.EDEN_NETWORK_CONTRACT_ADDRESS;
    assert(contractAddress);

    const data = {
      abis: {
        EdenNetwork: edenNetworkAbi
      },
      dataSource: {
        address: contractAddress,
        network: 'mainnet',
        name: 'EdenNetwork'
      }
    };

    const contractInterface = new utils.Interface(edenNetworkAbi);

    it('should load the subgraph network wasm', async () => {
      const filePath = path.resolve(__dirname, '../test/subgraph/eden/EdenNetwork/EdenNetwork.wasm');
      ({ exports } = await instantiate(
        db,
        indexer,
        provider,
        {
          rpcSupportsBlockHashParam: true,
          block: dummyEventData.block,
          contractAddress
        },
        filePath,
        data
      ));
      const { _start } = exports;
      _start();
    });

    it('should call the slotClaimed handler', async () => {
      const {
        slotClaimed
      } = exports;

      // Create dummy SlotClaimedEvent params.
      const eventFragment = contractInterface.getEvent('SlotClaimed(uint8,address,address,uint128,uint128,uint16,uint16)');
      dummyEventData.inputs = eventFragment.inputs;
      dummyEventData.event = {
        slot: 0,
        owner: ZERO_ADDRESS,
        delegate: ZERO_ADDRESS,
        newBidAmount: BigInt(1),
        oldBidAmount: BigInt(1),
        taxNumerator: 1,
        taxDenominator: 1
      };

      // Create an ethereum event SlotClaimedEvent to be passed to handler.
      const slotClaimedEvent = await createEvent(exports, contractAddress, dummyEventData);

      await slotClaimed(slotClaimedEvent);
    });

    it('should call the slotDelegateUpdated handler', async () => {
      const {
        slotDelegateUpdated
      } = exports;

      // Create dummy SlotDelegateUpdatedEvent params.
      const eventFragment = contractInterface.getEvent('SlotDelegateUpdated(uint8,address,address,address)');
      dummyEventData.inputs = eventFragment.inputs;
      dummyEventData.event = {
        slot: 0,
        owner: ZERO_ADDRESS,
        newDelegate: ZERO_ADDRESS,
        oldDelegate: ZERO_ADDRESS
      };

      // Create an ethereum event SlotDelegateUpdatedEvent to be passed to handler.
      const slotClaimedEvent = await createEvent(exports, contractAddress, dummyEventData);

      await slotDelegateUpdated(slotClaimedEvent);
    });

    xit('should call the stake handler', async () => {
      const {
        stake
      } = exports;

      // Create dummy StakeEvent params.
      const eventFragment = contractInterface.getEvent('Stake(address,uint256)');
      dummyEventData.inputs = eventFragment.inputs;
      dummyEventData.event = {
        staker: '0xDC7d7A8920C8Eecc098da5B7522a5F31509b5Bfc',
        stakeAmount: BigInt(1)
      };

      // Create an ethereum event StakeEvent to be passed to handler.
      const stakeEvent = await createEvent(exports, contractAddress, dummyEventData);

      await stake(stakeEvent);
    });

    xit('should call the unstake handler', async () => {
      const {
        unstake
      } = exports;

      // Create dummy UnstakeEvent params.
      const eventFragment = contractInterface.getEvent('Unstake(address,uint256)');
      dummyEventData.inputs = eventFragment.inputs;
      dummyEventData.event = {
        staker: ZERO_ADDRESS,
        unstakedAmount: BigInt(1)
      };

      // Create an ethereum event UnstakeEvent to be passed to handler.
      const unstakeEvent = await createEvent(exports, contractAddress, dummyEventData);

      await unstake(unstakeEvent);
    });
  });

  describe('EdenNetworkDistribution wasm', () => {
    let exports: any;

    // EdenNetworkDistribution contract address string.
    const contractAddress = process.env.EDEN_NETWORK_DISTRIBUTION_CONTRACT_ADDRESS;
    assert(contractAddress);

    const data = {
      abis: {
        Distribution: merkleDistributorAbi
      },
      dataSource: {
        address: contractAddress,
        network: 'mainnet',
        name: 'EdenNetworkDistribution'
      }
    };

    const contractInterface = new utils.Interface(merkleDistributorAbi);

    it('should load the subgraph network distribution wasm', async () => {
      const filePath = path.resolve(__dirname, '../test/subgraph/eden/EdenNetworkDistribution/EdenNetworkDistribution.wasm');
      ({ exports } = await instantiate(db,
        indexer,
        provider,
        {
          rpcSupportsBlockHashParam: true,
          block: dummyEventData.block,
          contractAddress
        },
        filePath,
        data
      ));
      const { _start } = exports;
      _start();
    });

    it('should call the claimed handler', async () => {
      const {
        claimed
      } = exports;

      // Create dummy ClaimedEvent params.
      const eventFragment = contractInterface.getEvent('Claimed(uint256,uint256,address,uint256)');
      dummyEventData.inputs = eventFragment.inputs;
      dummyEventData.event = {
        index: BigInt(1),
        totalEarned: BigInt(1),
        account: ZERO_ADDRESS,
        claimed: BigInt(1)
      };

      // Create an ethereum event ClaimedEvent to be passed to handler.
      const claimedEvent = await createEvent(exports, contractAddress, dummyEventData);

      await claimed(claimedEvent);
    });

    it('should call the slashed handler', async () => {
      const {
        slashed
      } = exports;

      // Create dummy SlashedEvent params.
      const eventFragment = contractInterface.getEvent('Slashed(address,uint256)');
      dummyEventData.inputs = eventFragment.inputs;
      dummyEventData.event = {
        account: ZERO_ADDRESS,
        slashed: BigInt(1)
      };

      // Create an ethereum event SlashedEvent to be passed to handler.
      const slashedEvent = await createEvent(exports, contractAddress, dummyEventData);

      await slashed(slashedEvent);
    });

    it('should call the merkleRootUpdated handler', async () => {
      const {
        merkleRootUpdated
      } = exports;

      // Create dummy MerkleRootUpdatedEvent params.
      const eventFragment = contractInterface.getEvent('MerkleRootUpdated(bytes32,uint256,string)');
      dummyEventData.inputs = eventFragment.inputs;
      dummyEventData.event = {
        merkleRoot: ethers.utils.hexlify(ethers.utils.randomBytes(32)),
        distributionNumber: BigInt(1),
        metadataURI: 'abc'
      };

      // Create an ethereum event MerkleRootUpdatedEvent to be passed to handler.
      const merkleRootUpdatedEvent = await createEvent(exports, contractAddress, dummyEventData);

      await merkleRootUpdated(merkleRootUpdatedEvent);
    });

    it('should call the accountUpdated handler', async () => {
      const {
        accountUpdated
      } = exports;

      // Create dummy AccountUpdatedEvent params.
      const eventFragment = contractInterface.getEvent('AccountUpdated(address,uint256,uint256)');
      dummyEventData.inputs = eventFragment.inputs;
      dummyEventData.event = {
        account: ZERO_ADDRESS,
        totalClaimed: BigInt(1),
        totalSlashed: BigInt(1)
      };

      // Create an ethereum event AccountUpdatedEvent to be passed to handler.
      const accountUpdatedEvent = await createEvent(exports, contractAddress, dummyEventData);

      await accountUpdated(accountUpdatedEvent);
    });
  });

  describe('EdenNetworkGovernance wasm', () => {
    let exports: any;

    // EdenNetworkGovernance contract address string.
    const contractAddress = process.env.EDEN_NETWORK_GOVERNANCE_CONTRACT_ADDRESS;
    assert(contractAddress);

    const data = {
      abis: {
        Governance: distributorGovernanceAbi
      },
      dataSource: {
        address: contractAddress,
        network: 'mainnet',
        name: 'EdenNetworkGovernance'
      }
    };

    const contractInterface = new utils.Interface(distributorGovernanceAbi);

    it('should load the subgraph network governance wasm', async () => {
      const filePath = path.resolve(__dirname, '../test/subgraph/eden/EdenNetworkGovernance/EdenNetworkGovernance.wasm');
      ({ exports } = await instantiate(
        db,
        indexer,
        provider,
        {
          rpcSupportsBlockHashParam: true,
          block: dummyEventData.block,
          contractAddress
        },
        filePath,
        data
      ));
      const { _start } = exports;
      _start();
    });

    it('should call the blockProducerAdded handler', async () => {
      const {
        blockProducerAdded
      } = exports;

      // Create dummy BlockProducerAddedEvent params.
      const eventFragment = contractInterface.getEvent('BlockProducerAdded(address)');
      dummyEventData.inputs = eventFragment.inputs;
      dummyEventData.event = { producer: ZERO_ADDRESS };

      // Create an ethereum event BlockProducerAddedEvent to be passed to handler.
      const blockProducerAddedEvent = await createEvent(exports, contractAddress, dummyEventData);

      await blockProducerAdded(blockProducerAddedEvent);
    });

    it('should call the blockProducerRemoved handler', async () => {
      const {
        blockProducerRemoved
      } = exports;

      // Create dummy BlockProducerRemovedEvent params.
      const eventFragment = contractInterface.getEvent('BlockProducerRemoved(address)');
      dummyEventData.inputs = eventFragment.inputs;
      dummyEventData.event = { producer: ZERO_ADDRESS };

      // Create an ethereum event BlockProducerRemovedEvent to be passed to handler.
      const blockProducerRemovedEvent = await createEvent(exports, contractAddress, dummyEventData);

      await blockProducerRemoved(blockProducerRemovedEvent);
    });

    it('should call the blockProducerRewardCollectorChanged handler', async () => {
      const {
        blockProducerRewardCollectorChanged
      } = exports;

      // Create dummy BlockProducerRewardCollectorChangedEvent params.
      const eventFragment = contractInterface.getEvent('BlockProducerRewardCollectorChanged(address,address)');
      dummyEventData.inputs = eventFragment.inputs;
      dummyEventData.event = {
        producer: ZERO_ADDRESS,
        collector: ZERO_ADDRESS,
        metadataURI: 'abc'
      };

      // Create an ethereum event BlockProducerRewardCollectorChangedEvent to be passed to handler.
      const blockProducerRewardCollectorChangedEvent = await createEvent(exports, contractAddress, dummyEventData);

      await blockProducerRewardCollectorChanged(blockProducerRewardCollectorChangedEvent);
    });

    it('should call the rewardScheduleChanged handler', async () => {
      const {
        rewardScheduleChanged
      } = exports;

      const eventFragment = contractInterface.getEvent('RewardScheduleChanged()');
      dummyEventData.inputs = eventFragment.inputs;
      dummyEventData.event = {};

      // Create an ethereum event RewardScheduleChangedEvent to be passed to handler.
      const rewardScheduleChangedEvent = await createEvent(exports, contractAddress, dummyEventData);

      await rewardScheduleChanged(rewardScheduleChangedEvent);
    });

    it('should call the block handler', async () => {
      const { handleBlock } = exports;
      const blockData = dummyEventData.block;

      // Create an ethereum block to be passed to the handler.
      const block = await createBlock(exports, blockData);

      await handleBlock(block);
    });
  });

  after(() => {
    sandbox.restore();
  });
});
