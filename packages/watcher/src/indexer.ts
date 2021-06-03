import assert from "assert";
import debug from 'debug';
import { invert } from "lodash";

import { EthClient, getMappingSlot, topictoAddress } from "@vulcanize/ipld-eth-client";
import { getStorageInfo, getEventNameTopics, getStorageValue, GetStorageAt } from '@vulcanize/solidity-mapper';

import { Database } from './database';

const log = debug('vulcanize:indexer');

export class Indexer {

  _db: Database
  _ethClient: EthClient
  _getStorageAt: GetStorageAt

  _abi: any
  _storageLayout: any

  constructor(db, ethClient, artifacts) {
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
  }

  async totalSupply(blockHash, token) {
    // TODO: Use getStorageValue when it supports uint256 values.
    const { slot } = getStorageInfo(this._storageLayout, '_totalSupply');

    const vars = {
      blockHash,
      contract: token,
      slot
    };

    const result = await this._getStorageAt(vars);
    log(JSON.stringify(result, null, 2));

    return result;
  }

  async balanceOf(blockHash, token, owner) {
    const entity = await this._db.getBalance({ blockHash, token, owner });
    if (entity) {
      return {
        value: entity.value,
        proof: JSON.parse(entity.proof)
      }
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
    log(JSON.stringify(result, null, 2));

    const { value, proof } = result;
    await this._db.saveBalance({ blockHash, token, owner, value, proof: JSON.stringify(proof) });

    return result;
  }

  async allowance(blockHash, token, owner, spender) {
    const entity = await this._db.getAllowance({ blockHash, token, owner, spender });
    if (entity) {
      return {
        value: entity.value,
        proof: JSON.parse(entity.proof)
      }
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
    log(JSON.stringify(result, null, 2));

    const { value, proof } = result;
    await this._db.saveAllowance({ blockHash, token, owner, spender, value, proof: JSON.stringify(proof) });

    return result;
  }

  async name(blockHash, token) {
    const result = await this._getStorageValue(blockHash, token, '_name');

    log(JSON.stringify(result, null, 2));

    return result;
  }

  async symbol(blockHash, token) {
    const result = await this._getStorageValue(blockHash, token, '_symbol');

    log(JSON.stringify(result, null, 2));

    return result;
  }

  async decimals(blockHash, token) {
    // Not a state variable, uses hardcoded return value in contract function.
    // See https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/ERC20.sol#L86

    throw new Error('Not implemented.');
  }

  async getEvents(blockHash, token, name) {
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
        const eventFields = {};

        switch (e.eventName) {
          case 'Transfer': {
            eventFields['from'] = e.transferFrom;
            eventFields['to'] = e.transferTo;
            eventFields['value'] = e.transferValue;
            break;
          };
          case 'Approval': {
            eventFields['owner'] = e.approvalOwner;
            eventFields['spender'] = e.approvalSpender;
            eventFields['value'] = e.approvalValue;
            break;
          };
        }

        return {
          event: {
            __typename: `${e.eventName}Event`,
            ...eventFields
          },
          // TODO: Return proof only if requested.
          proof: JSON.parse(e.proof)
        }
      });

    log(JSON.stringify(result, null, 2));

    return result;
  }

  // TODO: Move into base/class or framework package.
  async _getStorageValue(blockHash, token, variable) {
    return getStorageValue(
      this._storageLayout,
      this._getStorageAt,
      blockHash,
      token,
      variable
    );
  }

  async _fetchAndSaveEvents({ blockHash, token }) {
    const logs = await this._ethClient.getLogs({ blockHash, contract: token });
    log(JSON.stringify(logs, null, 2));

    const eventNameToTopic = getEventNameTopics(this._abi);
    const logTopicToEventName = invert(eventNameToTopic);

    const dbEvents = logs.map(log => {
      const { topics, data: value, cid, ipldBlock } = log;

      const [topic0, topic1, topic2] = topics;

      const eventName = logTopicToEventName[topic0];
      const address1 = topictoAddress(topic1);
      const address2 = topictoAddress(topic2);

      const event = {
        blockHash,
        token,
        eventName,

        proof: JSON.stringify({
          data: JSON.stringify({
            blockHash,
            receipt: {
              cid,
              ipldBlock
            }
          })
        }),
      };

      switch (eventName) {
        case 'Transfer': {
          event['transferFrom'] = address1;
          event['transferTo'] = address2;
          event['transferValue'] = value;
          break;
        };
        case 'Approval': {
          event['approvalOwner'] = address1;
          event['approvalSpender'] = address2;
          event['approvalValue'] = value;
          break;
        };
      }

      return event;
    });

    await this._db.saveEvents({ blockHash, token, events: dbEvents });
  }
}