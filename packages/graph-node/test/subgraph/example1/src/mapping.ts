import { Address, log, BigInt, BigDecimal, ByteArray, dataSource } from '@graphprotocol/graph-ts';

import {
  Example1,
  Test
} from '../generated/Example1/Example1';
import { ExampleEntity } from '../generated/schema';

export function handleTest (event: Test): void {
  log.debug('event.address: {}', [event.address.toHexString()]);
  log.debug('event.params.param1: {}', [event.params.param1]);
  log.debug('event.params.param2: {}', [event.params.param2.toString()]);
  log.debug('event.block.hash: {}', [event.block.hash.toHexString()]);
  log.debug('event.block.stateRoot: {}', [event.block.stateRoot.toHexString()]);

  // Entities can be loaded from the store using a string ID; this ID
  // needs to be unique across all entities of the same type
  let entity = ExampleEntity.load(event.transaction.from.toHex());

  // Entities only exist after they have been saved to the store;
  // `null` checks allow to create entities on demand
  if (!entity) {
    entity = new ExampleEntity(event.transaction.from.toHex());

    // Entity fields can be set using simple assignments
    entity.count = BigInt.fromString('0');
  }

  // BigInt and BigDecimal math are supported
  entity.count = entity.count + BigInt.fromString('1');

  // Entity fields can be set based on event parameters
  entity.paramString = event.params.param1;
  entity.paramInt = event.params.param2;
  entity.paramBoolean = true;
  entity.paramBytes = event.address;
  entity.paramEnum = 'choice1';

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
  const contractAddress = dataSource.address();
  const contract = Example1.bind(contractAddress);

  // Access functions by calling them.
  const res = contract.try_getMethod();
  if (res.reverted) {
    log.debug('Contract eth call reverted', []);
  } else {
    log.debug('Contract eth call result: {}', [res.value]);
  }
}

export function testBytesToHex (): string {
  log.debug('In test bytesToHex', []);

  const hexString = '0x231a';
  log.debug('Using hexString: {}', [hexString]);

  const byteArray = ByteArray.fromHexString(hexString);
  const res = byteArray.toHexString();
  log.debug('typeConversion.bytesToHex result: {}', [res]);

  return res;
}

export function testBigIntToString (): string {
  log.debug('In test bigIntToString', []);

  const bigInt = BigInt.fromString('1000000000000000000');
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

export function testBigDecimalToString (): string {
  log.debug('In test bigDecimalToString', []);

  const bigInt = BigInt.fromString('1000000000000000000');
  const bigDecimal = bigInt.toBigDecimal();
  const res = bigDecimal.toString();
  log.debug('typeConversion.bigIntToString from hex result: {}', [res]);

  return res;
}

export function testBigDecimalFromString (value: string): string {
  log.debug('In test bigDecimal.fromString', []);

  const bigDecimal = BigDecimal.fromString(value);
  const res = bigDecimal.toString();
  log.debug('bigDecimal.FromString result: {}', [res]);

  return res;
}

export function testBigDecimalDividedBy (): string {
  log.debug('In test bigDecimal.dividedBy', []);

  const bigInt1 = BigInt.fromString('1000000000000000000');
  const bigInt2 = BigInt.fromString('100');

  const bigDecimal1 = new BigDecimal(bigInt1);
  const bigDecimal2 = new BigDecimal(bigInt2);
  const res = bigDecimal1 / bigDecimal2;
  log.debug('bigDecimal.dividedBy result: {}', [res.toString()]);

  return res.toString();
}

export function testBigIntPlus (): string {
  log.debug('In test bigInt.plus', []);

  const bigInt1 = BigInt.fromString('100');
  const bigInt2 = BigInt.fromString('100');

  const res = bigInt1 + bigInt2;
  log.debug('bigInt.plus result: {}', [res.toString()]);
  return res.toString();
}

export function testBigIntMinus (): string {
  log.debug('In test bigInt.minus', []);

  const bigInt1 = BigInt.fromString('200');
  const bigInt2 = BigInt.fromString('100');

  const res = bigInt1 - bigInt2;
  log.debug('bigInt.minus result: {}', [res.toString()]);
  return res.toString();
}

export function testBigIntTimes (): string {
  log.debug('In test bigInt.times', []);

  const bigInt1 = BigInt.fromString('100');
  const bigInt2 = BigInt.fromString('10');

  const res = bigInt1 * bigInt2;
  log.debug('bigInt.times result: {}', [res.toString()]);
  return res.toString();
}

export function testBigIntDividedBy (): string {
  log.debug('In test bigInt.dividedBy', []);

  const bigInt1 = BigInt.fromString('1000');
  const bigInt2 = BigInt.fromString('10');

  const res = bigInt1 / bigInt2;
  log.debug('bigInt.dividedBy result: {}', [res.toString()]);
  return res.toString();
}

export function testBigIntFromString (value: string): string {
  log.debug('In test bigInt.fromString', []);

  const bigInt = BigInt.fromString(value);
  const res = bigInt.toString();
  log.debug('bigInt.FromString result: {}', [res]);

  return res;
}
