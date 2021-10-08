//
// Copyright 2021 Vulcanize, Inc.
//

import path from 'path';

import { instantiate } from './index';
import { TypeId } from './types';

describe('eden wasm loader tests', () => {
  describe('EdenNetwork wasm', () => {
    let exports: any;

    it('should load the subgraph network wasm', async () => {
      const filePath = path.resolve(__dirname, '../test/subgraph/eden/EdenNetwork/EdenNetwork.wasm');
      ({ exports } = await instantiate(filePath));
      const { _start } = exports;
      _start();
    });

    it('should call the slotClaimed handler', async () => {
      const {
        __newString,
        __newArray,
        slotClaimed,
        Address,
        BigInt,
        ethereum,
        Bytes,
        SlotClaimed,
        id_of_type: idOfType
      } = exports;

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

      const eventParams = await __newArray(await idOfType(TypeId.ArrayEventParam), []);

      // Dummy contract address string.
      const addStrPtr = await __newString('0x9E3382cA57F4404AC7Bf435475EAe37e87D1c453');

      // Create SlotClaimed event to be passed to handler.
      const slotClaimedEvent = await SlotClaimed.__new(
        await Address.fromString(addStrPtr),
        await BigInt.fromI32(0),
        await BigInt.fromI32(0),
        null,
        block,
        transaction,
        eventParams
      );

      await slotClaimed(slotClaimedEvent);
    });
  });

  it('should load the subgraph network distribution wasm', async () => {
    const filePath = path.resolve(__dirname, '../test/subgraph/eden/EdenNetworkDistribution/EdenNetworkDistribution.wasm');
    const { exports: { _start } } = await instantiate(filePath);
    _start();
  });

  it('should load the subgraph network governance wasm', async () => {
    const filePath = path.resolve(__dirname, '../test/subgraph/eden/EdenNetworkGovernance/EdenNetworkGovernance.wasm');
    const { exports: { _start } } = await instantiate(filePath);
    _start();
  });
});
