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

  // Perform indexing based on the type of event.
}
