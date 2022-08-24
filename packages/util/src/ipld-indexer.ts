//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import { ethers } from 'ethers';
import { sha256 } from 'multiformats/hashes/sha2';
import { CID } from 'multiformats/cid';
import _ from 'lodash';

import { EthClient } from '@vulcanize/ipld-eth-client';
import * as codec from '@ipld/dag-cbor';

import {
  IPLDDatabaseInterface,
  IndexerInterface,
  BlockProgressInterface,
  IPLDBlockInterface,
  StateKind
} from './types';
import { Indexer } from './indexer';
import { ServerConfig } from './config';
import { IPFSClient } from './ipfs';
import { JobQueue } from './job-queue';

export interface IpldStatus {
  init?: number;
  diff?: number;
  checkpoint?: number;
  // eslint-disable-next-line camelcase
  diff_staged?: number;
}

export class IPLDIndexer extends Indexer {
  _serverConfig: ServerConfig;
  _ipldDb: IPLDDatabaseInterface;
  _ipfsClient: IPFSClient;
  _ipldStatusMap: { [key: string]: IpldStatus } = {};

  constructor (
    serverConfig: ServerConfig,
    ipldDb: IPLDDatabaseInterface,
    ethClient: EthClient,
    ethProvider: ethers.providers.BaseProvider,
    jobQueue: JobQueue,
    ipfsClient: IPFSClient
  ) {
    super(ipldDb, ethClient, ethProvider, jobQueue);

    this._serverConfig = serverConfig;
    this._ipldDb = ipldDb;
    this._ipfsClient = ipfsClient;
  }

  getIPLDData (ipldBlock: IPLDBlockInterface): any {
    return codec.decode(Buffer.from(ipldBlock.data));
  }

  async pushToIPFS (data: any): Promise<void> {
    await this._ipfsClient.push(data);
  }

  isIPFSConfigured (): boolean {
    const ipfsAddr = this._serverConfig.ipfsApiAddr;

    // Return false if ipfsAddr is undefined | null | empty string.
    return (ipfsAddr !== undefined && ipfsAddr !== null && ipfsAddr !== '');
  }

  async getLatestHooksProcessedBlock (): Promise<BlockProgressInterface> {
    // Get current hookStatus.
    const ipldStatus = await this._ipldDb.getIPLDStatus();
    assert(ipldStatus, 'IPLD status not found');

    // Get all the blocks at height hookStatus.latestProcessedBlockNumber.
    const blocksAtHeight = await this.getBlocksAtHeight(ipldStatus.latestHooksBlockNumber, false);

    // There can exactly one block at hookStatus.latestProcessedBlockNumber height.
    assert(blocksAtHeight.length === 1);

    return blocksAtHeight[0];
  }

  async processCheckpoint (indexer: IndexerInterface, blockHash: string, checkpointInterval: number): Promise<void> {
    // Get all the contracts.
    const contracts = Object.values(this._watchedContracts);

    // Getting the block for checkpoint.
    const block = await this.getBlockProgress(blockHash);
    assert(block);

    // For each contract, merge the diff till now to create a checkpoint.
    for (const contract of contracts) {
      // Get IPLD status for the contract.
      const ipldStatus = this._ipldStatusMap[contract.address];
      assert(ipldStatus, `IPLD status for contract ${contract.address} not found`);

      const initBlockNumber = ipldStatus.init;

      // Check if contract has checkpointing on.
      // Check if it's time for a checkpoint or the init is in current block.
      if (
        contract.checkpoint &&
        (block.blockNumber % checkpointInterval === 0 || initBlockNumber === block.blockNumber)
      ) {
        await this.createCheckpoint(indexer, contract.address, block);
      }
    }
  }

  async processCLICheckpoint (indexer: IndexerInterface, contractAddress: string, blockHash?: string): Promise<string | undefined> {
    // Getting the block for checkpoint.
    let block;

    if (blockHash) {
      block = await this.getBlockProgress(blockHash);
    } else {
      // In case of empty blockHash from checkpoint CLI, get the latest processed block from hookStatus for the checkpoint.
      block = await this.getLatestHooksProcessedBlock();
    }

    assert(block);

    const checkpointBlockHash = await this.createCheckpoint(indexer, contractAddress, block);
    assert(checkpointBlockHash, 'Checkpoint not created');

    // Push checkpoint to IPFS if configured.
    if (this.isIPFSConfigured()) {
      const checkpointIPLDBlocks = await this._ipldDb.getIPLDBlocks({ block, contractAddress, kind: StateKind.Checkpoint });

      // There can be at most one IPLDBlock for a (block, contractAddress, kind) combination.
      assert(checkpointIPLDBlocks.length <= 1);
      const checkpointIPLDBlock = checkpointIPLDBlocks[0];

      const checkpointData = this.getIPLDData(checkpointIPLDBlock);
      await this.pushToIPFS(checkpointData);
    }

    return checkpointBlockHash;
  }

  async createStateCheckpoint (contractAddress: string, block: BlockProgressInterface, data: any): Promise<void> {
    // Get the contract.
    const contract = this._watchedContracts[contractAddress];
    assert(contract, `Contract ${contractAddress} not watched`);

    if (block.blockNumber < contract.startingBlock) {
      return;
    }

    // Create a checkpoint from the hook data without being concerned about diffs.
    const ipldBlock = await this.prepareIPLDBlock(block, contractAddress, data, StateKind.Checkpoint);
    await this.saveOrUpdateIPLDBlock(ipldBlock);
  }

  async createInit (
    indexer: IndexerInterface,
    blockHash: string,
    blockNumber: number
  ): Promise<void> {
    // Get all the contracts.
    const contracts = Object.values(this._watchedContracts);

    // Create an initial state for each contract.
    for (const contract of contracts) {
      // Check if contract has checkpointing on.
      if (contract.checkpoint) {
        // Check if starting block not reached yet.
        if (blockNumber < contract.startingBlock) {
          continue;
        }

        // Get IPLD status for the contract.
        const ipldStatus = this._ipldStatusMap[contract.address];
        assert(ipldStatus, `IPLD status for contract ${contract.address} not found`);

        // Check if a 'init' IPLDBlock already exists.
        // Or if a 'diff' IPLDBlock already exists.
        // Or if a 'checkpoint' IPLDBlock already exists.
        // (A watcher with imported state won't have an init IPLDBlock, but it will have the imported checkpoint)
        if (
          ipldStatus.init ||
          ipldStatus.diff ||
          ipldStatus.checkpoint
        ) {
          continue;
        }

        // Call initial state hook.
        assert(indexer.processInitialState);
        const stateData = await indexer.processInitialState(contract.address, blockHash);

        const block = await this.getBlockProgress(blockHash);
        assert(block);

        const ipldBlock = await this.prepareIPLDBlock(block, contract.address, stateData, StateKind.Init);
        await this.saveOrUpdateIPLDBlock(ipldBlock);

        // Push initial state to IPFS if configured.
        if (this.isIPFSConfigured()) {
          const ipldData = this.getIPLDData(ipldBlock);
          await this.pushToIPFS(ipldData);
        }
      }
    }
  }

  async createDiffStaged (contractAddress: string, blockHash: string, data: any): Promise<void> {
    const block = await this.getBlockProgress(blockHash);
    assert(block);

    // Get the contract.
    const contract = this._watchedContracts[contractAddress];
    assert(contract, `Contract ${contractAddress} not watched`);

    if (block.blockNumber < contract.startingBlock) {
      return;
    }

    // Create a staged diff block.
    const ipldBlock = await this.prepareIPLDBlock(block, contractAddress, data, StateKind.DiffStaged);
    await this.saveOrUpdateIPLDBlock(ipldBlock);
  }

  async finalizeDiffStaged (blockHash: string): Promise<void> {
    const block = await this.getBlockProgress(blockHash);
    assert(block);

    // Get all the staged diff blocks for the given blockHash.
    const stagedBlocks = await this._ipldDb.getIPLDBlocks({ block, kind: StateKind.DiffStaged });

    // For each staged block, create a diff block.
    for (const stagedBlock of stagedBlocks) {
      const data = codec.decode(Buffer.from(stagedBlock.data));
      await this.createDiff(stagedBlock.contractAddress, block, data);
    }

    // Remove all the staged diff blocks for current blockNumber.
    // (Including staged diff blocks associated with pruned blocks)
    await this.removeIPLDBlocks(block.blockNumber, StateKind.DiffStaged);
  }

  async createDiff (contractAddress: string, block: BlockProgressInterface, data: any): Promise<void> {
    // Get the contract.
    const contract = this._watchedContracts[contractAddress];
    assert(contract, `Contract ${contractAddress} not watched`);

    if (block.blockNumber < contract.startingBlock) {
      return;
    }

    // Get IPLD status for the contract.
    const ipldStatus = this._ipldStatusMap[contractAddress];
    assert(ipldStatus, `IPLD status for contract ${contractAddress} not found`);

    // Get the latest checkpoint block number.
    const checkpointBlockNumber = ipldStatus.checkpoint;

    if (!checkpointBlockNumber) {
      // Get the initial state block number.
      const initBlockNumber = ipldStatus.init;

      // There should be an initial state at least.
      assert(initBlockNumber, 'No initial state found');
    } else if (checkpointBlockNumber === block.blockNumber) {
      // Check if the latest checkpoint is in the same block if block number is same.
      const checkpoint = await this._ipldDb.getLatestIPLDBlock(contractAddress, StateKind.Checkpoint);
      assert(checkpoint);

      assert(checkpoint.block.blockHash !== block.blockHash, 'Checkpoint already created for the block hash');
    }

    const ipldBlock = await this.prepareIPLDBlock(block, contractAddress, data, StateKind.Diff);
    await this.saveOrUpdateIPLDBlock(ipldBlock);
  }

  async createCheckpoint (indexer: IndexerInterface, contractAddress: string, currentBlock: BlockProgressInterface): Promise<string | undefined> {
    // Get the contract.
    const contract = this._watchedContracts[contractAddress];
    assert(contract, `Contract ${contractAddress} not watched`);

    if (currentBlock.blockNumber < contract.startingBlock) {
      return;
    }

    // Make sure the block is marked complete.
    assert(currentBlock.isComplete, 'Block for a checkpoint should be marked as complete');

    // Get current hookStatus.
    const ipldStatus = await this._ipldDb.getIPLDStatus();
    assert(ipldStatus);

    // Make sure the hooks have been processed for the block.
    assert(currentBlock.blockNumber <= ipldStatus.latestHooksBlockNumber, 'Block for a checkpoint should have hooks processed');

    // Call state checkpoint hook and check if default checkpoint is disabled.
    assert(indexer.processStateCheckpoint);
    const disableDefaultCheckpoint = await indexer.processStateCheckpoint(contractAddress, currentBlock.blockHash);

    if (disableDefaultCheckpoint) {
      // Return if default checkpoint is disabled.
      // Return block hash for checkpoint CLI.
      return currentBlock.blockHash;
    }

    // Fetch the latest 'checkpoint' | 'init' for the contract to fetch diffs after it.
    let prevNonDiffBlock: IPLDBlockInterface;
    let diffStartBlockNumber: number;
    const checkpointBlock = await this._ipldDb.getLatestIPLDBlock(contractAddress, StateKind.Checkpoint, currentBlock.blockNumber - 1);

    if (checkpointBlock) {
      const checkpointBlockNumber = checkpointBlock.block.blockNumber;

      prevNonDiffBlock = checkpointBlock;
      diffStartBlockNumber = checkpointBlockNumber;

      // Update IPLD status map with the latest checkpoint info.
      // Essential while importing state as checkpoint at the snapshot block is added by import-state CLI.
      // (job-runner won't have the updated ipld status)
      this.updateIPLDStatusMap(contractAddress, { checkpoint: checkpointBlockNumber });
    } else {
      // There should be an initial state at least.
      const initBlock = await this._ipldDb.getLatestIPLDBlock(contractAddress, StateKind.Init);
      assert(initBlock, 'No initial state found');

      prevNonDiffBlock = initBlock;
      // Take block number previous to initial state block as the checkpoint is to be created in the same block.
      diffStartBlockNumber = initBlock.block.blockNumber - 1;
    }

    // Fetching all diff blocks after the latest 'checkpoint' | 'init'.
    const diffBlocks = await this._ipldDb.getDiffIPLDBlocksInRange(contractAddress, diffStartBlockNumber, currentBlock.blockNumber);

    const prevNonDiffBlockData = codec.decode(Buffer.from(prevNonDiffBlock.data)) as any;
    const data = {
      state: prevNonDiffBlockData.state
    };

    for (const diffBlock of diffBlocks) {
      const diff = codec.decode(Buffer.from(diffBlock.data)) as any;
      data.state = _.merge(data.state, diff.state);
    }

    const ipldBlock = await this.prepareIPLDBlock(currentBlock, contractAddress, data, StateKind.Checkpoint);
    await this.saveOrUpdateIPLDBlock(ipldBlock);

    return currentBlock.blockHash;
  }

  async prepareIPLDBlock (block: BlockProgressInterface, contractAddress: string, data: any, kind: StateKind):Promise<any> {
    let ipldBlock: IPLDBlockInterface;

    // Get IPLD status for the contract.
    const ipldStatus = this._ipldStatusMap[contractAddress];
    assert(ipldStatus, `IPLD status for contract ${contractAddress} not found`);

    // Get an existing 'init' | 'diff' | 'diff_staged' | 'checkpoint' IPLDBlock for current block, contractAddress to update.
    let currentIPLDBlock: IPLDBlockInterface | undefined;
    const prevIPLDBlockNumber = ipldStatus[kind];

    // Fetch from DB for previous IPLD block or for checkpoint kind.
    if (kind === 'checkpoint' || (prevIPLDBlockNumber && prevIPLDBlockNumber === block.blockNumber)) {
      const currentIPLDBlocks = await this._ipldDb.getIPLDBlocks({ block, contractAddress, kind });

      // There can be at most one IPLDBlock for a (block, contractAddress, kind) combination.
      assert(currentIPLDBlocks.length <= 1);
      currentIPLDBlock = currentIPLDBlocks[0];
    }

    if (currentIPLDBlock) {
      // Update current IPLDBlock of same kind if it exists.
      ipldBlock = currentIPLDBlock;

      // Update the data field.
      const oldData = codec.decode(Buffer.from(ipldBlock.data));
      data = _.merge(oldData, data);
    } else {
      // Create a new IPLDBlock instance.
      ipldBlock = this._ipldDb.getNewIPLDBlock();

      // Fetch the parent IPLDBlock.
      const parentIPLDBlock = await this._ipldDb.getLatestIPLDBlock(contractAddress, null, block.blockNumber);

      // Setting the meta-data for an IPLDBlock (done only once per IPLD block).
      data.meta = {
        id: contractAddress,
        kind,
        parent: {
          '/': parentIPLDBlock ? parentIPLDBlock.cid : null
        },
        ethBlock: {
          cid: {
            '/': block.cid
          },
          num: block.blockNumber
        }
      };
    }

    // Encoding the data using dag-cbor codec.
    const bytes = codec.encode(data);

    // Calculating sha256 (multi)hash of the encoded data.
    const hash = await sha256.digest(bytes);

    // Calculating the CID: v1, code: dag-cbor, hash.
    const cid = CID.create(1, codec.code, hash);

    // Update ipldBlock with new data.
    ipldBlock = Object.assign(ipldBlock, {
      block,
      contractAddress,
      cid: cid.toString(),
      kind: data.meta.kind,
      data: Buffer.from(bytes)
    });

    return ipldBlock;
  }

  async getIPLDBlocksByHash (blockHash: string): Promise<IPLDBlockInterface[]> {
    const block = await this.getBlockProgress(blockHash);
    assert(block);

    return this._ipldDb.getIPLDBlocks({ block });
  }

  async getIPLDBlockByCid (cid: string): Promise<IPLDBlockInterface | undefined> {
    const ipldBlocks = await this._ipldDb.getIPLDBlocks({ cid });

    // There can be only one IPLDBlock with a particular cid.
    assert(ipldBlocks.length <= 1);

    return ipldBlocks[0];
  }

  async saveOrUpdateIPLDBlock (ipldBlock: IPLDBlockInterface): Promise<IPLDBlockInterface> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._ipldDb.saveOrUpdateIPLDBlock(dbTx, ipldBlock);

      await dbTx.commitTransaction();

      // Get IPLD status for the contract.
      const ipldStatus = this._ipldStatusMap[res.contractAddress];
      assert(ipldStatus, `IPLD status for contract ${res.contractAddress} not found`);

      // Update the IPLD status for the kind.
      ipldStatus[res.kind] = res.block.blockNumber;
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
  }

  async removeIPLDBlocks (blockNumber: number, kind: StateKind): Promise<void> {
    const dbTx = await this._db.createTransactionRunner();

    try {
      await this._ipldDb.removeIPLDBlocks(dbTx, blockNumber, kind);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  }

  async fetchIPLDStatus (): Promise<void> {
    const contracts = Object.values(this._watchedContracts);

    for (const contract of contracts) {
      const initIPLDBlock = await this._ipldDb.getLatestIPLDBlock(contract.address, StateKind.Init);
      const diffIPLDBlock = await this._ipldDb.getLatestIPLDBlock(contract.address, StateKind.Diff);
      const diffStagedIPLDBlock = await this._ipldDb.getLatestIPLDBlock(contract.address, StateKind.DiffStaged);
      const checkpointIPLDBlock = await this._ipldDb.getLatestIPLDBlock(contract.address, StateKind.Checkpoint);

      this._ipldStatusMap[contract.address] = {
        init: initIPLDBlock?.block.blockNumber,
        diff: diffIPLDBlock?.block.blockNumber,
        diff_staged: diffStagedIPLDBlock?.block.blockNumber,
        checkpoint: checkpointIPLDBlock?.block.blockNumber
      };
    }
  }

  async updateIPLDStatusMap (address: string, ipldStatus: IpldStatus): Promise<void> {
    // Get and update IPLD status for the contract.
    const ipldStatusOld = this._ipldStatusMap[address];
    this._ipldStatusMap[address] = _.merge(ipldStatusOld, ipldStatus);
  }
}
