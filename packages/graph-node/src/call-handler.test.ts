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

  it('should execute the handler function', async () => {
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
    const block = await ethereum.Block.__new(
      await Bytes.empty(),
      await Bytes.empty(),
      await Bytes.empty(),
      await Address.zero(),
      await Bytes.empty(),
      await Bytes.empty(),
      await Bytes.empty(),
      await BigInt.fromI32(0),
      await BigInt.fromI32(0),
      await BigInt.fromI32(0),
      await BigInt.fromI32(0),
      await BigInt.fromI32(0),
      await BigInt.fromI32(0),
      null
    );

    // Create dummy transaction data.
    const transaction = await ethereum.Transaction.__new(
      await Bytes.empty(),
      await BigInt.fromI32(0),
      await Address.zero(),
      null,
      await BigInt.fromI32(0),
      await BigInt.fromI32(0),
      await BigInt.fromI32(0),
      await Bytes.empty()
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

    const eventParamArrayPromise = eventParamsData.map(async data => {
      const { name, value, kind } = data;
      let ethValue;

      switch (kind) {
        case 'uint': {
          const bigIntString = await (await __newString(value.toString()));
          const bigInt = await BigInt.fromString(bigIntString);
          ethValue = await ethereum.Value.fromUnsignedBigInt(bigInt);
          break;
        }

        case 'string': {
          ethValue = await ethereum.Value.fromString(await __newString(value));
          break;
        }

        default:
          break;
      }

      return ethereum.EventParam.__new(
        await __newString(name),
        ethValue
      );
    });

    const eventParamArray = await Promise.all(eventParamArrayPromise);
    const eventParams = await __newArray(await idOfType(TypeId.ArrayEventParam), eventParamArray);

    // Dummy contract address string.
    const addStrPtr = await __newString('0xCA6D29232D1435D8198E3E5302495417dD073d61');

    // Create Test event to be passed to handler.
    const test = await Test.__new(
      await Address.fromString(addStrPtr),
      await BigInt.fromI32(0),
      await BigInt.fromI32(0),
      null,
      block,
      transaction,
      eventParams
    );

    await handleTest(test);
  });
});
