import assert from 'assert';
import debug from 'debug';
import { Mokka } from 'mokka';
import { pipe } from 'it-pipe';
import * as lp from 'it-length-prefixed';
import { pushable, Pushable } from 'it-pushable';

import type { Peer } from '@cerc-io/peer';
import type { Stream as P2PStream } from '@libp2p/interface-connection';
import type { PeerId } from '@libp2p/interface-peer-id';
import { peerIdFromString } from '@libp2p/peer-id';

const log = debug('laconic:consensus');

const CONSENSUS_PROTOCOL = '/consensus/1.0.0';

const DEFAULT_HEARTBEAT = 300;
const DEFAULT_ELECTION_TIMEOUT = 1000;
const DEFAULT_PROOF_EXPIRATION = 20000;
const DEFAULT_CRASH_MODEL = 'BFT';

export interface PartyPeer {
  peerId: string;
  publicKey: string;
}

export interface ConsensusOptions {
  peer: Peer;

  publicKey: string;
  privateKey: string;

  party: PartyPeer[];

  // For Mokka options (ISettingsInterface)
  heartbeat?: number;
  electionTimeout?: number;
  proofExpiration?: number;
  crashModel?: 'CFT' | 'BFT';
}

export class Consensus extends Mokka {
  peer: Peer;
  party: PartyPeer[];

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

    super({
      address,
      privateKey: options.privateKey,
      heartbeat,
      electionTimeout,
      proofExpiration,
      crashModel,
      // TODO: Implement logger using debug log / use bunyan
      logger: console
    });

    this.peer = options.peer;
    this.party = options.party;

    // Add peer nodes in the party
    for (const partyPeer of options.party) {
      const address = `${partyPeer.peerId}/${partyPeer.publicKey}`;
      this.nodeApi.join(address);
    }
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
    super.connect();
  }

  async write (address: string, packet: Buffer): Promise<void> {
    assert(this.peer.node);

    let messageStream = this.messageStreamMap.get(address);
    if (!messageStream) {
      const peerId = peerIdFromString(address);

      // Dial to the peer over consensus protocol
      const p2pStream = await this.peer.node.dialProtocol(peerId, CONSENSUS_PROTOCOL);

      // Setup send and receive pipes
      messageStream = this.handleStream(peerId, p2pStream);
    }

    messageStream.push(packet);
  }

  async disconnect (): Promise<void> {
    assert(this.peer.node);
    await super.disconnect();

    // Close all consensus protocol streams
    for (const partyPeer of this.party) {
      for (const conn of this.peer.node.getConnections(peerIdFromString(partyPeer.peerId))) {
        conn.streams.forEach(stream => {
          if (stream.stat.protocol === CONSENSUS_PROTOCOL) {
            stream.close();
          }
        });
      }
    }
  }

  private handleStream (peerId: PeerId, stream: P2PStream): Pushable<any> {
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
