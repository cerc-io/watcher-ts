//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';

import { Indexer, ResultEvent } from './indexer';

/**
 * Event hook function.
 * @param indexer Indexer instance that contains methods to fetch and update the contract values in the database.
 * @param eventData ResultEvent object containing necessary information.
 */
export async function handleEvent (indexer: Indexer, eventData: ResultEvent): Promise<void> {
  assert(indexer);
  assert(eventData);

  // The following code is for ERC20 contract implementation.

  // Perform indexing based on the type of event.
  switch (eventData.event.__typename) {
    // In case of ERC20 'Transfer' event.
    case 'TransferEvent': {
      // On a transfer, balances for both parties change.
      // Therefore, trigger indexing for both sender and receiver.

      // Get event fields from eventData.
      // const { from, to } = eventData.event;

      // Update balance entry for sender in the database.
      // await indexer.balanceOf(eventData.block.hash, eventData.contract, from);

      // Update balance entry for receiver in the database.
      // await indexer.balanceOf(eventData.block.hash, eventData.contract, to);

      break;
    }
    // In case of ERC20 'Approval' event.
    case 'ApprovalEvent': {
      // On an approval, allowance for (owner, spender) combination changes.

      // Get event fields from eventData.
      // const { owner, spender } = eventData.event;

      // Update allowance entry for (owner, spender) combination in the database.
      // await indexer.allowance(eventData.block.hash, eventData.contract, owner, spender);

      break;
    }
  }
}
