//
// Copyright 2022 Vulcanize, Inc.
//

import debug from 'debug';
import path from 'path';
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
  Config,
  PaymentsManager,
  Consensus,
  readParty
} from '@cerc-io/util';
import { TypeSource } from '@graphql-tools/utils';
import type {
  RelayNodeInitConfig,
  PeerInitConfig,
  PeerIdObj,
  Peer
  // @ts-expect-error https://github.com/microsoft/TypeScript/issues/49721#issuecomment-1319854183
} from '@cerc-io/peer';
import { Node as NitroNode, utils } from '@cerc-io/nitro-node';
// @ts-expect-error TODO: Resolve (Not able to find the type declarations)
import type { Libp2p } from '@cerc-io/libp2p';

import { BaseCmd } from './base';
import { readPeerId } from './utils/index';

const log = debug('vulcanize:server');

interface Arguments {
  configFile: string;
}

export class ServerCmd {
  _argv?: Arguments;
  _baseCmd: BaseCmd;
  _peer?: Peer;
  _nitro?: NitroNode;
  _consensus?: Consensus;

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

  get peer (): Peer | undefined {
    return this._peer;
  }

  get nitro (): NitroNode | undefined {
    return this._nitro;
  }

  get consensus (): Consensus | undefined {
    return this._consensus;
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

  async initP2P (): Promise<[Libp2p | undefined, Peer | undefined]> {
    let relayNode: Libp2p | undefined;

    // Start P2P nodes if config provided
    const p2pConfig = this._baseCmd.config.server.p2p;
    if (!p2pConfig) {
      return [relayNode, this._peer];
    }

    const { createRelayNode, Peer } = await import('@cerc-io/peer');
    const {
      RELAY_DEFAULT_HOST,
      RELAY_DEFAULT_PORT,
      RELAY_DEFAULT_MAX_DIAL_RETRY,
      RELAY_REDIAL_INTERVAL,
      DEFAULT_PING_INTERVAL,
      DIAL_TIMEOUT
    } = await import('@cerc-io/peer');

    // Run the relay node if enabled
    if (p2pConfig.enableRelay) {
      const relayConfig = p2pConfig.relay;
      assert(relayConfig, 'Relay config not set');

      let peerIdObj: PeerIdObj | undefined;
      if (relayConfig.peerIdFile) {
        peerIdObj = readPeerId(relayConfig.peerIdFile);
      }

      const relayNodeInit: RelayNodeInitConfig = {
        host: relayConfig.host ?? RELAY_DEFAULT_HOST,
        port: relayConfig.port ?? RELAY_DEFAULT_PORT,
        announceDomain: relayConfig.announce,
        relayPeers: relayConfig.relayPeers ?? [],
        denyMultiaddrs: relayConfig.denyMultiaddrs ?? [],
        dialTimeout: relayConfig.dialTimeout ?? DIAL_TIMEOUT,
        pingInterval: relayConfig.pingInterval ?? DEFAULT_PING_INTERVAL,
        redialInterval: relayConfig.redialInterval ?? RELAY_REDIAL_INTERVAL,
        maxDialRetry: relayConfig.maxDialRetry ?? RELAY_DEFAULT_MAX_DIAL_RETRY,
        peerIdObj,
        pubsub: relayConfig.pubsub,
        enableDebugInfo: relayConfig.enableDebugInfo
      };

      relayNode = await createRelayNode(relayNodeInit);
    }

    // Run a peer node if enabled
    if (p2pConfig.enablePeer) {
      const peerConfig = p2pConfig.peer;
      assert(peerConfig, 'Peer config not set');

      let peerIdObj: PeerIdObj | undefined;
      if (peerConfig.peerIdFile) {
        peerIdObj = readPeerId(peerConfig.peerIdFile);
      }

      this._peer = new Peer(peerConfig.relayMultiaddr, true);

      const peerNodeInit: PeerInitConfig = {
        pingInterval: peerConfig.pingInterval,
        pingTimeout: peerConfig.pingTimeout,
        denyMultiaddrs: peerConfig.denyMultiaddrs,
        maxRelayConnections: peerConfig.maxRelayConnections,
        relayRedialInterval: peerConfig.relayRedialInterval,
        maxConnections: peerConfig.maxConnections,
        dialTimeout: peerConfig.dialTimeout,
        pubsub: peerConfig.pubsub,
        enableDebugInfo: peerConfig.enableDebugInfo
      };
      await this._peer.init(peerNodeInit, peerIdObj);

      log(`Peer ID: ${this._peer.peerId?.toString()}`);
    }

    return [relayNode, this._peer];
  }

  async initConsensus (): Promise<Consensus | undefined> {
    const p2pConfig = this._baseCmd.config.server.p2p;
    const { consensus: consensusConfig } = p2pConfig;

    // Setup consensus engine if enabled
    // Consensus requires p2p peer to be enabled
    if (!p2pConfig.enablePeer || !consensusConfig.enabled) {
      return;
    }

    assert(this.peer);
    const watcherPartyPeers = readParty(consensusConfig.watcherPartyFile);

    // Create and initialize the consensus engine
    this._consensus = new Consensus({
      peer: this.peer,
      publicKey: consensusConfig.publicKey,
      privateKey: consensusConfig.privateKey,
      party: watcherPartyPeers
    });

    // Connect registers the required p2p protocol handlers and starts the engine
    this._consensus.connect();
    log('Consensus engine started');

    return this._consensus;
  }

  async initNitro (nitroContractAddresses: { [key: string]: string }): Promise<NitroNode | undefined> {
    // Start a Nitro node
    const {
      server: {
        p2p: {
          enablePeer,
          nitro: nitroConfig
        }
      },
      upstream: {
        ethServer: {
          rpcProviderEndpoint
        }
      }
    } = this._baseCmd.config;

    // Nitro requires p2p peer to be enabled
    if (!enablePeer) {
      return;
    }

    assert(this.peer);
    const nitro = await utils.Nitro.setupNode(
      nitroConfig.privateKey,
      rpcProviderEndpoint,
      nitroConfig.chainPrivateKey,
      nitroContractAddresses,
      this.peer,
      path.resolve(nitroConfig.store)
    );

    this._nitro = nitro.node;
    log(`Nitro node started with address: ${this._nitro.address}`);

    return this._nitro;
  }

  async exec (
    createResolvers: (indexer: IndexerInterface, eventWatcher: EventWatcher) => Promise<any>,
    typeDefs: TypeSource,
    paymentsManager?: PaymentsManager
  ): Promise<{
    app: Application,
    server: ApolloServer
  }> {
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
    const server = await createAndStartServer(app, typeDefs, resolvers, config.server, paymentsManager);

    await startGQLMetricsServer(config);

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
