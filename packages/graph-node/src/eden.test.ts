//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import { ethers } from 'ethers';
import path from 'path';
import chai from 'chai';
import spies from 'chai-spies';

import { instantiate } from './loader';
import { createEvent, Block, createBlock } from './utils';
import edenNetworkAbi from '../test/subgraph/eden/EdenNetwork/abis/EdenNetwork.json';
import merkleDistributorAbi from '../test/subgraph/eden/EdenNetworkDistribution/abis/MerkleDistributor.json';
import distributorGovernanceAbi from '../test/subgraph/eden/EdenNetworkGovernance/abis/DistributorGovernance.json';
import { getDummyEventData, getTestDatabase } from '../test/utils';
import { Database } from './database';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

chai.use(spies);

const sandbox = chai.spy.sandbox();

describe('eden wasm loader tests', async () => {
  let db: Database;

  // Create dummy event data.
  const dummyEventData = getDummyEventData();

  before(async () => {
    db = getTestDatabase();

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
        address: contractAddress
      }
    };

    it('should load the subgraph network wasm', async () => {
      const filePath = path.resolve(__dirname, '../test/subgraph/eden/EdenNetwork/EdenNetwork.wasm');
      ({ exports } = await instantiate(db, { event: { block: dummyEventData.block } }, filePath, data));
      const { _start } = exports;
      _start();
    });

    it('should call the slotClaimed handler', async () => {
      const {
        slotClaimed
      } = exports;

      // Create dummy SlotClaimedEvent params.
      dummyEventData.eventParams = [
        {
          name: 'slot',
          kind: 'uint8',
          value: 0
        },
        {
          name: 'owner',
          kind: 'address',
          value: ZERO_ADDRESS
        },
        {
          name: 'delegate',
          kind: 'address',
          value: ZERO_ADDRESS
        },
        {
          name: 'newBidAmount',
          kind: 'uint128',
          value: BigInt(1)
        },
        {
          name: 'oldBidAmount',
          kind: 'uint128',
          value: BigInt(1)
        },
        {
          name: 'taxNumerator',
          kind: 'uint16',
          value: 1
        },
        {
          name: 'taxDenominator',
          kind: 'uint16',
          value: 1
        }
      ];

      // Create an ethereum event SlotClaimedEvent to be passed to handler.
      const slotClaimedEvent = await createEvent(exports, contractAddress, dummyEventData);

      await slotClaimed(slotClaimedEvent);
    });

    it('should call the slotDelegateUpdated handler', async () => {
      const {
        slotDelegateUpdated
      } = exports;

      // Create dummy SlotDelegateUpdatedEvent params.
      dummyEventData.eventParams = [
        {
          name: 'slot',
          kind: 'uint8',
          value: 0
        },
        {
          name: 'owner',
          kind: 'address',
          value: ZERO_ADDRESS
        },
        {
          name: 'newDelegate',
          kind: 'address',
          value: ZERO_ADDRESS
        },
        {
          name: 'oldDelegate',
          kind: 'address',
          value: ZERO_ADDRESS
        }
      ];

      // Create an ethereum event SlotDelegateUpdatedEvent to be passed to handler.
      const slotClaimedEvent = await createEvent(exports, contractAddress, dummyEventData);

      await slotDelegateUpdated(slotClaimedEvent);
    });

    xit('should call the stake handler', async () => {
      const {
        stake
      } = exports;

      // Create dummy StakeEvent params.
      dummyEventData.eventParams = [
        {
          name: 'staker',
          kind: 'address',
          value: '0xDC7d7A8920C8Eecc098da5B7522a5F31509b5Bfc'
        },
        {
          name: 'stakeAmount',
          kind: 'uint256',
          value: BigInt(1)
        }
      ];

      // Create an ethereum event StakeEvent to be passed to handler.
      const stakeEvent = await createEvent(exports, contractAddress, dummyEventData);

      await stake(stakeEvent);
    });

    xit('should call the unstake handler', async () => {
      const {
        unstake
      } = exports;

      // Create dummy UnstakeEvent params.
      dummyEventData.eventParams = [
        {
          name: 'staker',
          kind: 'address',
          value: ZERO_ADDRESS
        },
        {
          name: 'unstakedAmount',
          kind: 'uin256',
          value: BigInt(1)
        }
      ];

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
        address: contractAddress
      }
    };

    it('should load the subgraph network distribution wasm', async () => {
      const filePath = path.resolve(__dirname, '../test/subgraph/eden/EdenNetworkDistribution/EdenNetworkDistribution.wasm');
      ({ exports } = await instantiate(db, { event: { block: dummyEventData.block } }, filePath, data));
      const { _start } = exports;
      _start();
    });

    it('should call the claimed handler', async () => {
      const {
        claimed
      } = exports;

      // Create dummy ClaimedEvent params.
      dummyEventData.eventParams = [
        {
          name: 'index',
          kind: 'uint256',
          value: BigInt(1)
        },
        {
          name: 'totalEarned',
          kind: 'uint256',
          value: BigInt(1)
        },
        {
          name: 'account',
          kind: 'address',
          value: ZERO_ADDRESS
        },
        {
          name: 'claimed',
          kind: 'uint256',
          value: BigInt(1)
        }
      ];

      // Create an ethereum event ClaimedEvent to be passed to handler.
      const claimedEvent = await createEvent(exports, contractAddress, dummyEventData);

      await claimed(claimedEvent);
    });

    it('should call the slashed handler', async () => {
      const {
        slashed
      } = exports;

      // Create dummy SlashedEvent params.
      dummyEventData.eventParams = [
        {
          name: 'account',
          kind: 'address',
          value: ZERO_ADDRESS
        },
        {
          name: 'slashed',
          kind: 'uint256',
          value: BigInt(1)
        }
      ];

      // Create an ethereum event SlashedEvent to be passed to handler.
      const slashedEvent = await createEvent(exports, contractAddress, dummyEventData);

      await slashed(slashedEvent);
    });

    it('should call the merkleRootUpdated handler', async () => {
      const {
        merkleRootUpdated
      } = exports;

      // Create dummy MerkleRootUpdatedEvent params.
      dummyEventData.eventParams = [
        {
          name: 'merkleRoot',
          kind: 'bytes32',
          value: ethers.utils.hexlify(ethers.utils.randomBytes(32))
        },
        {
          name: 'distributionNumber',
          kind: 'uint256',
          value: BigInt(1)
        },
        {
          name: 'metadataURI',
          kind: 'string',
          value: 'abc'
        }
      ];

      // Create an ethereum event MerkleRootUpdatedEvent to be passed to handler.
      const merkleRootUpdatedEvent = await createEvent(exports, contractAddress, dummyEventData);

      await merkleRootUpdated(merkleRootUpdatedEvent);
    });

    it('should call the accountUpdated handler', async () => {
      const {
        accountUpdated
      } = exports;

      // Create dummy AccountUpdatedEvent params.
      dummyEventData.eventParams = [
        {
          name: 'account',
          kind: 'address',
          value: ZERO_ADDRESS
        },
        {
          name: 'totalClaimed',
          kind: 'uint256',
          value: BigInt(1)
        },
        {
          name: 'totalSlashed',
          kind: 'uint256',
          value: BigInt(1)
        }
      ];

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
        address: contractAddress
      }
    };

    it('should load the subgraph network governance wasm', async () => {
      const filePath = path.resolve(__dirname, '../test/subgraph/eden/EdenNetworkGovernance/EdenNetworkGovernance.wasm');
      ({ exports } = await instantiate(db, { event: { block: dummyEventData.block } }, filePath, data));
      const { _start } = exports;
      _start();
    });

    it('should call the blockProducerAdded handler', async () => {
      const {
        blockProducerAdded
      } = exports;

      // Create dummy BlockProducerAddedEvent params.
      dummyEventData.eventParams = [
        {
          name: 'produces',
          kind: 'address',
          value: ZERO_ADDRESS
        }
      ];

      // Create an ethereum event BlockProducerAddedEvent to be passed to handler.
      const blockProducerAddedEvent = await createEvent(exports, contractAddress, dummyEventData);

      await blockProducerAdded(blockProducerAddedEvent);
    });

    it('should call the blockProducerRemoved handler', async () => {
      const {
        blockProducerRemoved
      } = exports;

      // Create dummy BlockProducerRemovedEvent params.
      dummyEventData.eventParams = [
        {
          name: 'producer',
          kind: 'address',
          value: ZERO_ADDRESS
        }
      ];

      // Create an ethereum event BlockProducerRemovedEvent to be passed to handler.
      const blockProducerRemovedEvent = await createEvent(exports, contractAddress, dummyEventData);

      await blockProducerRemoved(blockProducerRemovedEvent);
    });

    it('should call the blockProducerRewardCollectorChanged handler', async () => {
      const {
        blockProducerRewardCollectorChanged
      } = exports;

      // Create dummy BlockProducerRewardCollectorChangedEvent params.
      dummyEventData.eventParams = [
        {
          name: 'producer',
          kind: 'address',
          value: ZERO_ADDRESS
        },
        {
          name: 'collector',
          kind: 'address',
          value: ZERO_ADDRESS
        },
        {
          name: 'metadataURI',
          kind: 'string',
          value: 'abc'
        }
      ];

      // Create an ethereum event BlockProducerRewardCollectorChangedEvent to be passed to handler.
      const blockProducerRewardCollectorChangedEvent = await createEvent(exports, contractAddress, dummyEventData);

      await blockProducerRewardCollectorChanged(blockProducerRewardCollectorChangedEvent);
    });

    it('should call the rewardScheduleChanged handler', async () => {
      const {
        rewardScheduleChanged
      } = exports;

      dummyEventData.eventParams = [];

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
