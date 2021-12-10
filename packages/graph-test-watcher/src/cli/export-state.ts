//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import yargs from 'yargs';
import 'reflect-metadata';
import debug from 'debug';
import fs from 'fs';
import path from 'path';

import { Config, DEFAULT_CONFIG_PATH, getConfig, initClients, STATE_KIND_CHECKPOINT } from '@vulcanize/util';
import { GraphWatcher, Database as GraphDatabase } from '@vulcanize/graph-node';
import * as codec from '@ipld/dag-cbor';

import { Database } from '../database';
import { Indexer } from '../indexer';

const log = debug('vulcanize:export-state');

const main = async (): Promise<void> => {
  const argv = await yargs.parserConfiguration({
    'parse-numbers': false
  }).options({
    configFile: {
      alias: 'f',
      type: 'string',
      require: true,
      demandOption: true,
      describe: 'Configuration file path (toml)',
      default: DEFAULT_CONFIG_PATH
    },
    exportFile: {
      alias: 'o',
      type: 'string',
      describe: 'Export file path'
    }
  }).argv;

  const config: Config = await getConfig(argv.configFile);
  const { ethClient, postgraphileClient, ethProvider } = await initClients(config);

  const db = new Database(config.database);
  await db.init();

  const graphDb = new GraphDatabase(config.database, path.resolve(__dirname, 'entity/*'));
  await graphDb.init();

  const graphWatcher = new GraphWatcher(graphDb, postgraphileClient, ethProvider, config.server.subgraphPath);

  const indexer = new Indexer(config.server, db, ethClient, postgraphileClient, ethProvider, graphWatcher);

  graphWatcher.setIndexer(indexer);
  await graphWatcher.init();

  const exportData: any = {
    snapshotBlock: {},
    contracts: [],
    ipldCheckpoints: []
  };

  const contracts = await db.getContracts({});

  // Get latest block with hooks processed.
  const block = await indexer.getLatestHooksProcessedBlock();
  assert(block);

  // Export snapshot block.
  exportData.snapshotBlock = {
    blockNumber: block.blockNumber,
    blockHash: block.blockHash
  };

  // Export contracts and checkpoints.
  for (const contract of contracts) {
    exportData.contracts.push({
      address: contract.address,
      kind: contract.kind,
      checkpoint: contract.checkpoint,
      startingBlock: block.blockNumber
    });

    // Create and export checkpoint if checkpointing is on for the contract.
    if (contract.checkpoint) {
      await indexer.createCheckpoint(contract.address, block.blockHash);

      const ipldBlock = await indexer.getLatestIPLDBlock(contract.address, STATE_KIND_CHECKPOINT, block.blockNumber);
      assert(ipldBlock);

      const data = indexer.getIPLDData(ipldBlock);

      if (indexer.isIPFSConfigured()) {
        await indexer.pushToIPFS(data);
      }

      exportData.ipldCheckpoints.push({
        contractAddress: ipldBlock.contractAddress,
        cid: ipldBlock.cid,
        kind: ipldBlock.kind,
        data
      });
    }
  }

  if (argv.exportFile) {
    const encodedExportData = codec.encode(exportData);

    const filePath = path.resolve(argv.exportFile);
    const fileDir = path.dirname(filePath);

    if (!fs.existsSync(fileDir)) fs.mkdirSync(fileDir, { recursive: true });

    fs.writeFileSync(filePath, encodedExportData);
  } else {
    log(exportData);
  }
};

main().catch(err => {
  log(err);
}).finally(() => {
  process.exit(0);
});
