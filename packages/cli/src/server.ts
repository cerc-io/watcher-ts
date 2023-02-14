//
// Copyright 2022 Vulcanize, Inc.
//

import debug from 'debug';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import 'reflect-metadata';
import assert from 'assert';
import { ConnectionOptions } from 'typeorm';
import express, { Application } from 'express';
import { ApolloServer } from 'apollo-server-express';

import { JsonRpcProvider } from '@ethersproject/providers';
import {
  DEFAULT_CONFIG_PATH,
  JobQueue,
  DatabaseInterface,
  IndexerInterface,
  ServerConfig,
  Clients,
  KIND_ACTIVE,
  createAndStartServer,
  startGQLMetricsServer,
  EventWatcher,
  GraphWatcherInterface,
  Config
} from '@cerc-io/util';
import { TypeSource } from '@graphql-tools/utils';

import { BaseCmd } from './base';
import { readPeerId } from './utils/index';

const libp2pLog = debug('vulcanize:libp2p');

interface Arguments {
  configFile: string;
}

export class ServerCmd {
  _argv?: Arguments
  _baseCmd: BaseCmd;

  constructor () {
    this._baseCmd = new BaseCmd();
  }

  get config (): Config {
    return this._baseCmd.config;
  }

  get clients (): Clients {
    return this._baseCmd.clients;
  }

  get ethProvider (): JsonRpcProvider {
    return this._baseCmd.ethProvider;
  }

  get database (): DatabaseInterface {
    return this._baseCmd.database;
  }

  async initConfig<ConfigType> (): Promise<ConfigType> {
    this._argv = this._getArgv();
    assert(this._argv);

    return this._baseCmd.initConfig(this._argv.configFile);
  }

  async init (
    Database: new (
      config: ConnectionOptions,
      serverConfig?: ServerConfig
    ) => DatabaseInterface,
    clients: { [key: string]: any } = {}
  ): Promise<void> {
    await this.initConfig();

    await this._baseCmd.init(Database, clients);
  }

  async initIndexer (
    Indexer: new (
      serverConfig: ServerConfig,
      db: DatabaseInterface,
      clients: Clients,
      ethProvider: JsonRpcProvider,
      jobQueue: JobQueue,
      graphWatcher?: GraphWatcherInterface
    ) => IndexerInterface,
    graphWatcher?: GraphWatcherInterface
  ): Promise<void> {
    await this._baseCmd.initIndexer(Indexer, graphWatcher);
    await this._baseCmd.initEventWatcher();
  }

  async exec (
    createResolvers: (indexer: IndexerInterface, eventWatcher: EventWatcher) => Promise<any>,
    typeDefs: TypeSource
  ): Promise<{
    app: Application,
    server: ApolloServer
  }> {
    const { createRelayNode, Peer } = await import('@cerc-io/peer');
    const { RELAY_DEFAULT_HOST, RELAY_DEFAULT_PORT, RELAY_DEFAULT_MAX_DIAL_RETRY } = await import('@cerc-io/peer');

    const config = this._baseCmd.config;
    const jobQueue = this._baseCmd.jobQueue;
    const indexer = this._baseCmd.indexer;
    const eventWatcher = this._baseCmd.eventWatcher;

    assert(config);
    assert(jobQueue);
    assert(indexer);
    assert(eventWatcher);

    if (config.server.kind === KIND_ACTIVE) {
      // Delete jobs to prevent creating jobs after completion of processing previous block.
      await jobQueue.deleteAllJobs();
      await eventWatcher.start();
    }

    const resolvers = await createResolvers(indexer, eventWatcher);

    // Create an Express app
    const app: Application = express();
    const server = await createAndStartServer(app, typeDefs, resolvers, config.server);

    await startGQLMetricsServer(config);

    const p2pConfig = config.server.p2p;

    // Run the relay node if enabled
    if (p2pConfig.enableRelay) {
      const relayConfig = config.server.p2p.relay;

      let peerIdObj: any;
      if (relayConfig.peerIdFile) {
        peerIdObj = readPeerId(relayConfig.peerIdFile);
      }

      const relayNodeInit = {
        host: relayConfig.host ?? RELAY_DEFAULT_HOST,
        port: relayConfig.port ?? RELAY_DEFAULT_PORT,
        announceDomain: relayConfig.announce,
        relayPeers: relayConfig.relayPeers ?? [],
        maxDialRetry: relayConfig.maxDialRetry ?? RELAY_DEFAULT_MAX_DIAL_RETRY,
        peerIdObj
      };
      await createRelayNode(relayNodeInit);
    }

    // Run a peer node if enabled
    if (p2pConfig.enablePeer) {
      const peer = new Peer(p2pConfig.relayMultiaddr, true);
      await peer.init();

      peer.subscribeTopic(p2pConfig.pubSubTopic, (peerId, data) => {
        libp2pLog(`> ${peerId.toString()} > ${data}`);
      });

      libp2pLog(`Peer ID: ${peer.peerId?.toString()}`);
    }

    return { app, server };
  }

  _getArgv (): any {
    return yargs(hideBin(process.argv))
      .option('f', {
        alias: 'config-file',
        demandOption: true,
        describe: 'configuration file path (toml)',
        type: 'string',
        default: DEFAULT_CONFIG_PATH
      })
      .argv;
  }
}
