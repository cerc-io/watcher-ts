import assert from "assert";
import debug from 'debug';
import { EthClient, getMappingSlot, topictoAddress } from "@vulcanize/ipld-eth-client";
import { Connection } from "typeorm";

import { getStorageInfo } from '@vulcanize/solidity-mapper';

import { storageLayout } from './artifacts/ERC20.json';

// Event signatures.
// TODO: Generate from ABI.
const ERC20_EVENT_NAME_TOPICS = {
  "Transfer": "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
  "Approval": "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925"
};

// Topic to GQL event name.
// TODO: Generate from ABI.
const GQL_EVENT_TYPE = {
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef": "TransferEvent",
  "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925": "ApprovalEvent"
};

const log = debug('vulcanize:indexer');

export class Indexer {

  _db: Connection
  _ethClient: EthClient

  constructor(db, ethClient) {
    assert(db);
    assert(ethClient);

    this._db = db;
    this._ethClient = ethClient;
  }

  async getBalanceOf(blockHash, token, owner) {
    const { slot: balancesSlot } = getStorageInfo(storageLayout, '_balances');
    const slot = getMappingSlot(balancesSlot, owner);

    const vars = {
      blockHash,
      contract: token,
      slot
    };

    const result = await this._ethClient.getStorageAt(vars);
    log(JSON.stringify(result, null, 2));

    const { value, cid, ipldBlock } = result;

    return {
      value,
      proof: {
        // TODO: Return proof only if requested.
        data: JSON.stringify({
          blockHash,
          account: {
            address: token,
            storage: {
              cid,
              ipldBlock
            }
          }
        })
      }
    }
  }

  async getAllowance(blockHash, token, owner, spender) {
    const { slot: allowancesSlot } = getStorageInfo(storageLayout, '_allowances');
    const slot = getMappingSlot(getMappingSlot(allowancesSlot, owner), spender);

    const vars = {
      blockHash,
      contract: token,
      slot
    };

    const result = await this._ethClient.getStorageAt(vars);
    log(JSON.stringify(result, null, 2));

    const { value, cid, ipldBlock } = result;

    return {
      value,
      proof: {
        // TODO: Return proof only if requested.
        data: JSON.stringify({
          blockHash,
          account: {
            address: token,
            storage: {
              cid,
              ipldBlock
            }
          }
        })
      }
    }
  }

  async getEvents(blockHash, token, name) {
    const vars = {
      blockHash,
      contract: token
    };

    const logs = await this._ethClient.getLogs(vars);
    log(JSON.stringify(logs, null, 2));

    return logs
      .filter(e => !name || ERC20_EVENT_NAME_TOPICS[name] === e.topics[0])
      .map(e => {
        const [topic0, topic1, topic2] = e.topics;

        const eventName = GQL_EVENT_TYPE[topic0];
        const address1 = topictoAddress(topic1);
        const address2 = topictoAddress(topic2);

        const eventFields = { value: e.data };


        switch (eventName) {
          case 'TransferEvent': {
            eventFields['from'] = address1;
            eventFields['to'] = address2;
            break;
          };
          case 'ApprovalEvent': {
            eventFields['owner'] = address1;
            eventFields['spender'] = address2;
            break;
          };
        }

        return {
          event: {
            __typename: eventName,
            ...eventFields
          },
          proof: {
            // TODO: Return proof only if requested.
            data: JSON.stringify({
              blockHash,
              receipt: {
                cid: e.cid,
                ipldBlock: e.ipldBlock
              }
            })
          }
        }
      });
  }
}