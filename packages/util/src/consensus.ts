import assert from 'assert';
// import debug from 'debug';
import { Mokka } from 'mokka';

import { Peer } from '@cerc-io/peer';

// const log = debug('laconic:consensus');

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

  // ISettingsInterface
  heartbeat?: number;
  electionTimeout?: number;
  proofExpiration?: number;
  crashModel?: 'CFT' | 'BFT';
}

export class Consensus extends Mokka {
  peer: Peer;

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

    // Add peer nodes in the party
    for (const partyPeer of options.party) {
      const address = `${partyPeer.peerId}/${partyPeer.publicKey}`;
      this.nodeApi.join(address);
    }
  }

  initialize (): void {
    // TODO: Register consensus protocol message handler

    // TODO: Dial over consensus protocol to peers
  }

  connect (): void {
    this.initialize();
    super.connect();
  }

  async disconnect (): Promise<void> {
    await super.disconnect();

    // TODO: Close all consensus protocol streams
  }

  async write (address: string, packet: Buffer): Promise<void> {
    assert(address);
    assert(packet);

    // TODO: Send message to peer over consensus protocol
  }
}
