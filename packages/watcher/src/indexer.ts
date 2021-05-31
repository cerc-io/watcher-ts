import assert from "assert";
import debug from 'debug';
import { Connection } from "typeorm";
import { invert } from "lodash";
import { EthClient, getMappingSlot, topictoAddress } from "@vulcanize/ipld-eth-client";
import { getStorageInfo, getEventNameTopics } from '@vulcanize/solidity-mapper';

import { storageLayout, abi } from './artifacts/ERC20.json';

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

    const erc20EventNameTopics = getEventNameTopics(abi);
    const gqlEventType = invert(erc20EventNameTopics);

    return logs
      .filter(e => !name || erc20EventNameTopics[name] === e.topics[0])
      .map(e => {
        const [topic0, topic1, topic2] = e.topics;

        const eventName = gqlEventType[topic0];
        const address1 = topictoAddress(topic1);
        const address2 = topictoAddress(topic2);

        const eventFields = { value: e.data };


        switch (eventName) {
          case 'Transfer': {
            eventFields['from'] = address1;
            eventFields['to'] = address2;
            break;
          };
          case 'Approval': {
            eventFields['owner'] = address1;
            eventFields['spender'] = address2;
            break;
          };
        }

        return {
          event: {
            __typename: `${eventName}Event`,
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