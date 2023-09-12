import assert from 'assert';
import debug from 'debug';
import { Mokka } from 'mokka';
import { pipe } from 'it-pipe';
import * as lp from 'it-length-prefixed';

import type { Peer } from '@cerc-io/peer';
import type { Stream } from '@libp2p/interface-connection';
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
      try {
        // Handle message from stream
        pipe(
          // Read from the stream (the source)
          stream.source,
          // Decode length-prefixed data
          lp.decode(),
          // // Turn buffers into objects
          // (source) => map(source, (buf) => {
          //   return JSON.parse(uint8ArrayToString(buf.subarray()));
          // }),
          // Sink function
          async (source) => {
            // For each chunk of data
            for await (const msg of source) {
              await this.emitPacket(Buffer.from(msg.subarray()));
            }
          }
        );
      } catch (err) {
        log(`Error on consensus message from ${connection.remotePeer}: ${err}`);
      }
    });
  }

  connect (): void {
    this.initialize();
    super.connect();
  }

  async write (address: string, packet: Buffer): Promise<void> {
    assert(this.peer.node);

    const peerId = peerIdFromString(address);
    try {
      let s: Stream | undefined;

      // Get an existing consensus stream with the peer
      const connections = this.peer.node.getConnections(peerId);
      for (const conn of connections) {
        s = conn.streams.find(s => s.stat.protocol === CONSENSUS_PROTOCOL);
        if (s) {
          break;
        }
      }

      // Create a stream if it doesn't exist
      if (!s) {
        s = await this.peer.node.dialProtocol(peerIdFromString(address), CONSENSUS_PROTOCOL);
      }

      // Use await on pipe in place of writer.Flush()
      await pipe(
        [packet],
        // Encode with length prefix (so receiving side knows how much data is coming)
        lp.encode(),
        // Write to the stream (the sink)
        s.sink
      );
    } catch (err) {
      // TODO: Implement retries?
      log(`Could not send consensus message to ${address}: ${err}`);
    }
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
}
