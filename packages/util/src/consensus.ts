//
// Copyright 2023 Vulcanize, Inc.
//

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import debug from 'debug';
import * as bunyan from 'bunyan';
import { Mokka } from 'mokka';
import * as MokkaStates from 'mokka/dist/consensus/constants/NodeStates';
// @ts-expect-error https://github.com/microsoft/TypeScript/issues/49721#issuecomment-1319854183
import type { Pushable } from 'it-pushable';

// @ts-expect-error https://github.com/microsoft/TypeScript/issues/49721#issuecomment-1319854183
import type { Peer } from '@cerc-io/peer';
// @ts-expect-error https://github.com/microsoft/TypeScript/issues/49721#issuecomment-1319854183
import type { Stream as P2PStream } from '@libp2p/interface-connection';
// @ts-expect-error https://github.com/microsoft/TypeScript/issues/49721#issuecomment-1319854183
import type { PeerId } from '@libp2p/interface-peer-id';

const LOG_NAMESPACE = 'laconic:consensus';
const CONSENSUS_LOG_LEVEL = 'debug';
const log = debug(LOG_NAMESPACE);

const CONSENSUS_PROTOCOL = '/consensus/1.0.0';

const NUM_WRITE_ATTEMPTS = 25;
const RETRY_SLEEP_DURATION = 15 * 1000; // 15 seconds

const DEFAULT_HEARTBEAT = 300;
const DEFAULT_ELECTION_TIMEOUT = 1000;
const DEFAULT_PROOF_EXPIRATION = 20000;
const DEFAULT_CRASH_MODEL = 'BFT';

const consensusStates: Record<number, string> = {
  [MokkaStates.default.STOPPED]: 'STOPPED',
  [MokkaStates.default.LEADER]: 'LEADER',
  [MokkaStates.default.CANDIDATE]: 'CANDIDATE',
  [MokkaStates.default.FOLLOWER]: 'FOLLOWER'
};

export interface PartyPeer {
  peerId: string;
  publicKey: string;
}

export interface ConsensusOptions {
  peer: Peer;

  publicKey: string;
  privateKey: string;

  partyPeers: PartyPeer[];

  // For Mokka options (ISettingsInterface)
  heartbeat?: number;
  electionTimeout?: number;
  proofExpiration?: number;
  crashModel?: 'CFT' | 'BFT';
}

export class Consensus extends Mokka {
  peer: Peer;
  partyPeers: PartyPeer[];

  private messageStreamMap: Map<string, Pushable<any>> = new Map();

  constructor (options: ConsensusOptions) {
    const heartbeat = options.heartbeat ?? DEFAULT_HEARTBEAT;
    const electionTimeout = options.electionTimeout ?? DEFAULT_ELECTION_TIMEOUT;
    const proofExpiration = options.proofExpiration ?? DEFAULT_PROOF_EXPIRATION;
    const crashModel = options.crashModel ?? DEFAULT_CRASH_MODEL;

    // address format: 'libp2p_peerid/node_publickey'
    // See:
    //    https://github.com/ega-forever/mokka#new-mokka-options
    //    https://github.com/ega-forever/mokka/blob/master/src/consensus/models/NodeModel.ts#L46
    const peerId = options.peer.peerId;
    const address = `${peerId?.toString()}/${options.publicKey}`;

    const logger = bunyan.createLogger({ name: LOG_NAMESPACE, level: CONSENSUS_LOG_LEVEL });

    super({
      address,
      privateKey: options.privateKey,
      heartbeat,
      electionTimeout,
      proofExpiration,
      crashModel,
      // TODO: Improve logging
      logger
    });

    // Subscribe to state changes
    this.on('state', () => {
      log(`State changed to ${this.state} (${consensusStates[this.state]}) with term ${this.term}`);
    });

    this.peer = options.peer;
    this.partyPeers = options.partyPeers;

    // Add peer nodes in the party
    // TODO: Skip initialization if party not provided?
    for (const partyPeer of options.partyPeers) {
      const address = `${partyPeer.peerId}/${partyPeer.publicKey}`;
      this.nodeApi.join(address);
    }
  }

  isLeader (): boolean {
    return this.state === MokkaStates.default.LEADER;
  }

  initialize (): void {
    assert(this.peer.node);

    this.peer.node.handle(CONSENSUS_PROTOCOL, async ({ stream, connection }) => {
      // Setup send and receive pipes
      this.handleStream(connection.remotePeer, stream);
    });
  }

  connect (): void {
    this.initialize();

    // TODO: Handle errors when peers don't join
    super.connect();
  }

  async write (address: string, packet: Buffer): Promise<void> {
    assert(this.peer.node);

    // TODO: Use a different strategy for retries?
    for (let i = 0; i < NUM_WRITE_ATTEMPTS; i += 1) {
      try {
        let messageStream = this.messageStreamMap.get(address);
        if (!messageStream) {
          const { peerIdFromString } = await import('@libp2p/peer-id');
          const peerId = peerIdFromString(address);

          // Dial to the peer over consensus protocol
          const p2pStream = await this.peer.node.dialProtocol(peerId, CONSENSUS_PROTOCOL);

          // Setup send and receive pipes
          messageStream = await this.handleStream(peerId, p2pStream);
        }

        messageStream.push(packet);
        return;
      } catch (err) {
        log(`Attempt ${i} - Could not open consensus stream to ${address}: ${err}`);
        if (i === NUM_WRITE_ATTEMPTS) {
          log('Write attempts exhausted');
        }

        // Retry after a set interval
        await new Promise((resolve) => { setTimeout(resolve, RETRY_SLEEP_DURATION); });
      }
    }
  }

  async disconnect (): Promise<void> {
    assert(this.peer.node);
    await super.disconnect();

    const { peerIdFromString } = await import('@libp2p/peer-id');

    // Close all consensus protocol streams
    for (const partyPeer of this.partyPeers) {
      for (const conn of this.peer.node.getConnections(peerIdFromString(partyPeer.peerId))) {
        conn.streams.forEach(stream => {
          if (stream.stat.protocol === CONSENSUS_PROTOCOL) {
            stream.close();
          }
        });
      }
    }
  }

  private async handleStream (peerId: PeerId, stream: P2PStream): Promise<Pushable<any>> {
    const { pushable } = await import('it-pushable');
    const { pipe } = await import('it-pipe');
    const lp = await import('it-length-prefixed');

    const messageStream = pushable({});

    try {
      // Send message to stream
      pipe(
        // Read from messageStream (the source)
        messageStream,
        // Encode with length prefix (so receiving side knows how much data is coming)
        lp.encode(),
        // Write to the stream (the sink)
        stream.sink
      );
    } catch (err) {
      // TODO: Implement retries / handle breakage
      log(`Could not send consensus message to ${peerId.toString()}: ${err}`);
    }

    try {
      // Handle message from stream
      pipe(
        // Read from the stream (the source)
        stream.source,
        // Decode length-prefixed data
        lp.decode(),
        // Sink function
        async (source) => {
          // For each chunk of data
          for await (const msg of source) {
            await this.emitPacket(Buffer.from(msg.subarray()));
          }
        }
      );
    } catch (err) {
      log(`Error on consensus message from ${peerId.toString()}: ${err}`);
    }

    this.messageStreamMap.set(peerId.toString(), messageStream);
    return messageStream;
  }
}

export const readParty = (filePath: string): PartyPeer[] => {
  if (!filePath || filePath === '') {
    log('Party peers file path not provided');
    return [];
  }

  const partyFilePath = path.resolve(filePath);
  log(`Reading party peers from file ${partyFilePath}`);

  const partyJson = fs.readFileSync(partyFilePath, 'utf-8');
  return JSON.parse(partyJson);
};
