//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import { utils } from 'ethers';

import { ResultEvent } from '@cerc-io/util';

import { Indexer, KIND_PHISHERREGISTRY } from './indexer';

const INVOKE_SIGNATURE = 'invoke(((((address,uint256,bytes),((address,bytes32,(address,bytes)[]),bytes)[])[],(uint256,uint256)),bytes)[])';
const CLAIM_IF_MEMBER_SIGNATURE = 'claimIfMember(string,bool)';
const CLAIM_IF_PHISHER_SIGNATURE = 'claimIfPhisher(string,bool)';

/**
 * Hook function to store an initial state.
 * @param indexer Indexer instance.
 * @param blockHash Hash of the concerned block.
 * @param contractAddress Address of the concerned contract.
 * @returns Data block to be stored.
 */
export async function createInitialState (indexer: Indexer, contractAddress: string, blockHash: string): Promise<any> {
  assert(indexer);
  assert(blockHash);
  assert(contractAddress);

  // Store an empty State.
  const stateData: any = {
    state: {}
  };

  // Use updateStateForElementaryType to update initial state with an elementary property.
  // Eg. const stateData = updateStateForElementaryType(stateData, '_totalBalance', result.value.toString());

  // Use updateStateForMappingType to update initial state with a nested property.
  // Eg. const stateData = updateStateForMappingType(stateData, '_allowances', [owner, spender], allowance.value.toString());

  // Return initial state data to be saved.
  return stateData;
}

/**
 * Hook function to create state diff.
 * @param indexer Indexer instance that contains methods to fetch the contract varaiable values.
 * @param blockHash Block hash of the concerned block.
 */
export async function createStateDiff (indexer: Indexer, blockHash: string): Promise<void> {
  assert(indexer);
  assert(blockHash);

  // Use indexer.createDiff() method to save custom state diff(s).
}

/**
 * Hook function to create state checkpoint
 * @param indexer Indexer instance.
 * @param contractAddress Address of the concerned contract.
 * @param blockHash Block hash of the concerned block.
 * @returns Whether to disable default checkpoint. If false, the state from this hook is updated with that from default checkpoint.
 */
export async function createStateCheckpoint (indexer: Indexer, contractAddress: string, blockHash: string): Promise<boolean> {
  assert(indexer);
  assert(blockHash);
  assert(contractAddress);

  // Use indexer.createStateCheckpoint() method to create a custom checkpoint.

  // Return false to update the state created by this hook by auto-generated checkpoint state.
  // Return true to disable update of the state created by this hook by auto-generated checkpoint state.
  return false;
}

/**
 * Event hook function.
 * @param indexer Indexer instance that contains methods to fetch and update the contract values in the database.
 * @param eventData ResultEvent object containing event information.
 */
export async function handleEvent (indexer: Indexer, eventData: ResultEvent): Promise<void> {
  assert(indexer);
  assert(eventData);

  // Perform indexing for PhisherStatusUpdated and MemberStatusUpdated.
  if (['PhisherStatusUpdatedEvent', 'MemberStatusUpdatedEvent'].includes(eventData.event.__typename)) {
    const txData = await indexer.getFullTransaction(eventData.tx.hash, eventData.block.number);
    const txDescription = getTxDescription(indexer, KIND_PHISHERREGISTRY, txData.input);
    let txDescriptions = [txDescription];

    if (txDescription.signature === INVOKE_SIGNATURE) {
      // Parse transactions from batches if it is an invoke method in Delegatable contract.
      txDescriptions = txDescription.args.signedInvocations
        .reduce((txs: utils.TransactionDescription[], signedInvocation: any) => {
          // Get transactions from signed invocations batch.
          const batchTxs = signedInvocation.invocations.batch.map((invocation: any) => {
            return getTxDescription(indexer, KIND_PHISHERREGISTRY, invocation.transaction.data);
          });

          txs.push(...batchTxs);

          return txs;
        }, []);
    }

    // Filter transactions for claimIfMember and claimIsPhisher methods.
    txDescriptions = txDescriptions.filter((tx: utils.TransactionDescription) => {
      return [CLAIM_IF_MEMBER_SIGNATURE, CLAIM_IF_PHISHER_SIGNATURE].includes(tx.signature);
    });

    for (const txDescription of txDescriptions) {
      switch (txDescription.signature) {
        case CLAIM_IF_MEMBER_SIGNATURE:
          // Update isMember entry for the identifier in database.
          await indexer.isMember(eventData.block.hash, eventData.contract, txDescription.args.identifier, true);
          break;
        case CLAIM_IF_PHISHER_SIGNATURE:
          // Update isPhisher entry for the identifier in database.
          await indexer.isPhisher(eventData.block.hash, eventData.contract, txDescription.args.identifier, true);
          break;
      }
    }
  }
}

// Get transaction details from input data.
const getTxDescription = (indexer: Indexer, contractKind: string, data: string): utils.TransactionDescription => {
  const contractInterface = indexer.getContractInterface(contractKind);
  assert(contractInterface);
  return contractInterface.parseTransaction({ data });
};
