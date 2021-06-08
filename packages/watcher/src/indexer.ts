import assert from 'assert';
import debug from 'debug';
import { invert } from 'lodash';
import { JsonFragment } from '@ethersproject/abi';
import { DeepPartial } from 'typeorm';
import JSONbig from 'json-bigint';
import { ethers } from 'ethers';

import { EthClient, getMappingSlot, topictoAddress } from '@vulcanize/ipld-eth-client';
import { getStorageInfo, getEventNameTopics, getStorageValue, GetStorageAt, StorageLayout } from '@vulcanize/solidity-mapper';

import { Database } from './database';
import { Event } from './entity/Event';

const log = debug('vulcanize:indexer');

interface Artifacts {
  abi: JsonFragment[];
  storageLayout: StorageLayout;
}

export interface ValueResult {
  value: string | BigInt;
  proof: {
    data: string;
  }
}

type EventsResult = Array<{
  event: {
    from?: string;
    to?: string;
    owner?: string;
    spender?: string;
    value?: BigInt;
    __typename: string;
  }
  proof: string;
}>

export class Indexer {
  _db: Database
  _ethClient: EthClient
  _getStorageAt: GetStorageAt

  _abi: JsonFragment[]
  _storageLayout: StorageLayout
  _contract: ethers.utils.Interface

  constructor (db: Database, ethClient: EthClient, artifacts: Artifacts) {
    assert(db);
    assert(ethClient);
    assert(artifacts);

    const { abi, storageLayout } = artifacts;

    assert(abi);
    assert(storageLayout);

    this._db = db;
    this._ethClient = ethClient;
    this._getStorageAt = this._ethClient.getStorageAt.bind(this._ethClient);

    this._abi = abi;
    this._storageLayout = storageLayout;

    this._contract = new ethers.utils.Interface(this._abi);
  }

  async totalSupply (blockHash: string, token: string): Promise<ValueResult> {
    const result = await this._getStorageValue(blockHash, token, '_totalSupply');

    // https://github.com/GoogleChromeLabs/jsbi/issues/30#issuecomment-521460510
    log(JSONbig.stringify(result, null, 2));

    return result;
  }

  async balanceOf (blockHash: string, token: string, owner: string): Promise<ValueResult> {
    const entity = await this._db.getBalance({ blockHash, token, owner });
    if (entity) {
      return {
        value: entity.value,
        proof: JSON.parse(entity.proof)
      };
    }

    // TODO: Use getStorageValue when it supports mappings.
    const { slot: balancesSlot } = getStorageInfo(this._storageLayout, '_balances');
    const slot = getMappingSlot(balancesSlot, owner);

    const vars = {
      blockHash,
      contract: token,
      slot
    };

    const result = await this._getStorageAt(vars);
    log(JSONbig.stringify(result, null, 2));

    const { value, proof } = result;
    await this._db.saveBalance({ blockHash, token, owner, value: BigInt(value), proof: JSONbig.stringify(proof) });

    return result;
  }

  async allowance (blockHash: string, token: string, owner: string, spender: string): Promise<ValueResult> {
    const entity = await this._db.getAllowance({ blockHash, token, owner, spender });
    if (entity) {
      return {
        value: entity.value,
        proof: JSON.parse(entity.proof)
      };
    }

    // TODO: Use getStorageValue when it supports nested mappings.
    const { slot: allowancesSlot } = getStorageInfo(this._storageLayout, '_allowances');
    const slot = getMappingSlot(getMappingSlot(allowancesSlot, owner), spender);

    const vars = {
      blockHash,
      contract: token,
      slot
    };

    const result = await this._getStorageAt(vars);
    log(JSONbig.stringify(result, null, 2));

    const { value, proof } = result;
    await this._db.saveAllowance({ blockHash, token, owner, spender, value: BigInt(value), proof: JSONbig.stringify(proof) });

    return result;
  }

  async name (blockHash: string, token: string): Promise<ValueResult> {
    const result = await this._getStorageValue(blockHash, token, '_name');

    log(JSONbig.stringify(result, null, 2));

    return result;
  }

  async symbol (blockHash: string, token: string): Promise<ValueResult> {
    const result = await this._getStorageValue(blockHash, token, '_symbol');

    log(JSONbig.stringify(result, null, 2));

    return result;
  }

  async decimals (): Promise<void> {
    // Not a state variable, uses hardcoded return value in contract function.
    // See https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/ERC20.sol#L86

    throw new Error('Not implemented.');
  }

  async processEvent (blockHash: string, token: string, receipt: any, logIndex: number): Promise<void> {
    const topics = [];

    // We only care about the event type for now.
    const data = '0x0000000000000000000000000000000000000000000000000000000000000000';

    topics.push(receipt.topic0S[logIndex]);
    topics.push(receipt.topic1S[logIndex]);
    topics.push(receipt.topic2S[logIndex]);

    const { name: eventName, args } = this._contract.parseLog({ topics, data });
    log(`process event ${eventName} ${args}`);

    switch (eventName) {
      case 'Transfer': {
        const [from, to] = args;

        // Update balance for sender and receiver.
        await this.balanceOf(blockHash, token, from);
        await this.balanceOf(blockHash, token, to);

        break;
      }
      case 'Approval': {
        const [owner, spender] = args;

        // Update allowance.
        await this.allowance(blockHash, token, owner, spender);

        break;
      }
    }
  }

  async getEvents (blockHash: string, token: string, name: string | null): Promise<EventsResult> {
    const didSyncEvents = await this._db.didSyncEvents({ blockHash, token });
    if (!didSyncEvents) {
      // Fetch and save events first and make a note in the event sync progress table.
      await this._fetchAndSaveEvents({ blockHash, token });
      log(`synced events for block ${blockHash} contract ${token}`);
    }

    assert(await this._db.didSyncEvents({ blockHash, token }));

    const events = await this._db.getEvents({ blockHash, token });

    const result = events
      // TODO: Filter using db WHERE condition when name is not empty.
      .filter(event => !name || name === event.eventName)
      .map(e => {
        const eventFields: {
          from?: string,
          to?: string,
          value?: BigInt,
          owner?: string,
          spender?: string,
        } = {};

        switch (e.eventName) {
          case 'Transfer': {
            eventFields.from = e.transferFrom;
            eventFields.to = e.transferTo;
            eventFields.value = e.transferValue;
            break;
          }
          case 'Approval': {
            eventFields.owner = e.approvalOwner;
            eventFields.spender = e.approvalSpender;
            eventFields.value = e.approvalValue;
            break;
          }
        }

        return {
          event: {
            __typename: `${e.eventName}Event`,
            ...eventFields
          },
          // TODO: Return proof only if requested.
          proof: JSON.parse(e.proof)
        };
      });

    log(JSONbig.stringify(result, null, 2));

    return result;
  }

  async isWatchedContract (address : string): Promise<boolean> {
    assert(address);

    return this._db.isWatchedContract(address);
  }

  // TODO: Move into base/class or framework package.
  async _getStorageValue (blockHash: string, token: string, variable: string): Promise<ValueResult> {
    return getStorageValue(
      this._storageLayout,
      this._getStorageAt,
      blockHash,
      token,
      variable
    );
  }

  async _fetchAndSaveEvents ({ blockHash, token }: { blockHash: string, token: string }): Promise<void> {
    const logs = await this._ethClient.getLogs({ blockHash, contract: token });
    log(JSONbig.stringify(logs, null, 2));

    const eventNameToTopic = getEventNameTopics(this._abi);
    const logTopicToEventName = invert(eventNameToTopic);

    const dbEvents = logs.map((log: any) => {
      const { topics, data: value, cid, ipldBlock } = log;

      const [topic0, topic1, topic2] = topics;

      const eventName = logTopicToEventName[topic0];
      const address1 = topictoAddress(topic1);
      const address2 = topictoAddress(topic2);

      const event: DeepPartial<Event> = {
        blockHash,
        token,
        eventName,

        proof: JSONbig.stringify({
          data: JSONbig.stringify({
            blockHash,
            receipt: {
              cid,
              ipldBlock
            }
          })
        })
      };

      switch (eventName) {
        case 'Transfer': {
          event.transferFrom = address1;
          event.transferTo = address2;
          event.transferValue = BigInt(value);
          break;
        }
        case 'Approval': {
          event.approvalOwner = address1;
          event.approvalSpender = address2;
          event.approvalValue = BigInt(value);
          break;
        }
      }

      return event;
    });

    await this._db.saveEvents({ blockHash, token, events: dbEvents });
  }
}
