import { Address, log, BigInt, Bytes } from '@graphprotocol/graph-ts';

import {
  Example1,
  Test
} from '../generated/Example1/Example1';
import { ExampleEntity } from '../generated/schema';

export function handleTest (event: Test): void {
  // Entities can be loaded from the store using a string ID; this ID
  // needs to be unique across all entities of the same type
  let entity = ExampleEntity.load(event.transaction.from.toHex());

  // Entities only exist after they have been saved to the store;
  // `null` checks allow to create entities on demand
  if (!entity) {
    entity = new ExampleEntity(event.transaction.from.toHex());

    // Entity fields can be set using simple assignments
    entity.count = BigInt.fromI32(0);
  }

  // BigInt and BigDecimal math are supported
  // entity.count = entity.count + BigInt.fromI32(1)

  // Entity fields can be set based on event parameters
  entity.param1 = event.params.param1;
  entity.param2 = event.params.param2;

  // Entities can be written to the store with `.save()`
  entity.save();

  // Note: If a handler doesn't require existing field values, it is faster
  // _not_ to load the entity from the store. Instead, create it fresh with
  // `new Entity(...)`, set the fields that should be updated and save the
  // entity back to the store. Fields that were not set or unset remain
  // unchanged, allowing for partial updates to be applied.

  // It is also possible to access smart contracts from mappings. For
  // example, the contract that has emitted the event can be connected to
  // with:
  //
  // let contract = Contract.bind(event.address)
  //
  // The following functions can then be called on this contract to access
  // state variables and other data:
  //
  // - contract.getMethod(...)
}

export function testEthCall (): void {
  log.debug('In test eth call', []);

  // Bind the contract to the address that emitted the event.
  // TODO: Address.fromString throws error in WASM module instantiation.
  const contractAddress = Address.fromString('0xafAd925B5eAE1E370196cBa39893E858ff7257d5');
  const contract = Example1.bind(contractAddress);

  // Access functions by calling them.
  const res = contract.try_getMethod();
  if (res.reverted) {
    log.debug('Contract eth call reverted', []);
  } else {
    log.debug('Contract eth call result', []);
  }
}

export function testBytesToHex (): string {
  log.debug('In test bytesToHex', []);

  const hexString = '0x231a';
  log.debug('Using hexString: {}', [hexString]);

  const byteArray = Bytes.fromHexString(hexString);
  const res = byteArray.toHexString();
  log.debug('typeConversion.bytesToHex result: {}', [res]);

  return res;
}

export function testBigIntToString (): string {
  log.debug('In test bigIntToString', []);

  const hexString = '0x0de0b6b3a7640000';
  log.debug('Using hexString for 1000000000000000000: {}', [hexString]);

  const byteArray = Bytes.fromHexString(hexString);
  const bigInt = BigInt.fromByteArray(byteArray);
  const res = bigInt.toString();
  log.debug('typeConversion.bigIntToString from hex result: {}', [res]);

  return res;
}

export function testStringToH160 (): string {
  log.debug('In test stringToH160', []);

  const addressString = '0xafad925b5eae1e370196cba39893e858ff7257d5';
  const address = Address.fromString(addressString);
  const res = address.toHexString();
  log.debug('typeConversion.stringToH160 result: {}', [res]);

  return res;
}
