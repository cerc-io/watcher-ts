//
// Copyright 2021 Vulcanize, Inc.
//

import path from 'path';

import { instantiate } from './index';
import { TypeId } from './types';

describe('call handler in mapping code', () => {
  let exports: any;

  it('should load the subgraph example wasm', async () => {
    const filePath = path.resolve(__dirname, '../test/subgraph/example1/build/Example1/Example1.wasm');
    const instance = await instantiate(filePath);
    exports = instance.exports;
  });

  it('should execute the handler function', () => {
    const {
      _start,
      __newString,
      __newArray,
      handleTest,
      Address,
      BigInt,
      ethereum,
      Bytes,
      Test,
      id_of_type: idOfType
    } = exports;

    // Important to call _start for built subgraphs on instantiation!
    // TODO: Check api version https://github.com/graphprotocol/graph-node/blob/6098daa8955bdfac597cec87080af5449807e874/runtime/wasm/src/module/mod.rs#L533
    _start();

    // Create dummy block data.
    const block = new ethereum.Block(
      Bytes.empty(),
      Bytes.empty(),
      Bytes.empty(),
      Address.zero(),
      Bytes.empty(),
      Bytes.empty(),
      Bytes.empty(),
      BigInt.fromI32(0),
      BigInt.fromI32(0),
      BigInt.fromI32(0),
      BigInt.fromI32(0),
      BigInt.fromI32(0),
      BigInt.fromI32(0),
      null
    );

    // Create dummy transaction data.
    const transaction = new ethereum.Transaction(
      Bytes.empty(),
      BigInt.fromI32(0),
      Address.zero(),
      null,
      BigInt.fromI32(0),
      BigInt.fromI32(0),
      BigInt.fromI32(0),
      Bytes.empty()
    );

    // Create event params data.
    const eventParamsData = [
      {
        name: 'param1',
        value: 'abc',
        kind: 'string'
      },
      {
        name: 'param2',
        value: 123,
        kind: 'uint'
      }
    ];

    const eventParamArray = eventParamsData.map(data => {
      const { name, value, kind } = data;
      let ethValue;

      switch (kind) {
        case 'uint': {
          const bigIntString = __newString(value.toString());
          ethValue = ethereum.Value.fromUnsignedBigInt(BigInt.fromString(bigIntString));
          break;
        }

        case 'string': {
          ethValue = ethereum.Value.fromString(__newString(value));
          break;
        }

        default:
          break;
      }

      return new ethereum.EventParam(
        __newString(name),
        ethValue
      );
    });

    const eventParams = __newArray(idOfType(TypeId.ArrayEventParam), eventParamArray);

    // Dummy contract address string.
    const addStrPtr = __newString('0xCA6D29232D1435D8198E3E5302495417dD073d61');

    // Create Test event to be passed to handler.
    const test = new Test(
      Address.fromString(addStrPtr),
      BigInt.fromI32(0),
      BigInt.fromI32(0),
      null,
      block,
      transaction,
      eventParams
    );

    handleTest(test);
  });
});
