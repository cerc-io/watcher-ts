import assert from 'assert';
import { Mokka } from 'mokka';

export class Consensus extends Mokka {
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
