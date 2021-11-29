import { Address, log, BigInt, BigDecimal, ByteArray, dataSource, ethereum } from '@graphprotocol/graph-ts';

import {
  Example1,
  Test
} from '../generated/Example1/Example1';
import { Author, Blog, Category } from '../generated/schema';

export function handleTest (event: Test): void {
  log.debug('event.address: {}', [event.address.toHexString()]);
  log.debug('event.params.param1: {}', [event.params.param1]);
  log.debug('event.params.param2: {}', [event.params.param2.toString()]);
  log.debug('event.params.param3: {}', [event.params.param3.toString()]);
  log.debug('event.block.hash: {}', [event.block.hash.toHexString()]);
  log.debug('event.block.stateRoot: {}', [event.block.stateRoot.toHexString()]);

  // Entities can be loaded from the store using a string ID; this ID
  // needs to be unique across all entities of the same type
  let author = Author.load(event.transaction.from.toHex());

  // Entities only exist after they have been saved to the store;
  // `null` checks allow to create entities on demand
  if (!author) {
    author = new Author(event.transaction.from.toHex());

    // Entity fields can be set using simple assignments
    author.blogCount = BigInt.fromString('0');
  }

  // BigInt and BigDecimal math are supported
  author.blogCount = author.blogCount + BigInt.fromString('1');

  // Entity fields can be set based on event parameters
  author.name = event.params.param1;
  author.paramInt = event.params.param2;
  author.paramBigInt = event.params.param3;
  author.paramBytes = event.address;
  author.rating = BigDecimal.fromString('3.2132354');

  // Entities can be written to the store with `.save()`
  author.save();

  let category = Category.load(author.blogCount.toString());

  if (!category) {
    category = new Category(author.blogCount.toString());
    category.name = event.params.param1;
  }

  category.count = category.count + BigInt.fromString('1');
  category.save();

  const blog = new Blog(event.transaction.hash.toHexString());
  blog.kind = 'long';
  blog.isActive = true;

  const blogReviews = blog.reviews;
  blogReviews.push(BigInt.fromString('4'));
  blog.reviews = blogReviews;

  blog.author = author.id;

  const categories = blog.categories;
  categories.push(category.id);
  blog.categories = categories;

  blog.save();

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

export function handleBlock (block: ethereum.Block): void {
  log.debug('block.hash: {}', [block.hash.toHexString()]);
  log.debug('block.parentHash: {}', [block.parentHash.toHexString()]);
  log.debug('block.unclesHash: {}', [block.unclesHash.toHexString()]);
  log.debug('block.author: {}', [block.author.toHexString()]);
  log.debug('block.stateRoot: {}', [block.stateRoot.toHexString()]);
  log.debug('block.transactionsRoot: {}', [block.transactionsRoot.toHexString()]);
  log.debug('block.receiptsRoot: {}', [block.receiptsRoot.toHexString()]);
  log.debug('block.number: {}', [block.number.toString()]);
  log.debug('block.gasUsed: {}', [block.gasUsed.toString()]);
  log.debug('block.gasLimit: {}', [block.gasLimit.toString()]);
  log.debug('block.timestamp: {}', [block.timestamp.toString()]);
  log.debug('block.difficulty: {}', [block.difficulty.toString()]);
  log.debug('block.totalDifficulty: {}', [block.totalDifficulty.toString()]);

  const blockSize = block.size;

  if (blockSize) {
    log.debug('block.size: {}', [blockSize.toString()]);
  } else {
    log.debug('block.size: {}', ['null']);
  }
}

export function testGetEthCall (): void {
  log.debug('In test get eth call', []);

  // Bind the contract to the address that emitted the event.
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

export function testAddEthCall (): void {
  log.debug('In test add eth call', []);

  const contractAddress = dataSource.address();
  const contract = Example1.bind(contractAddress);

  // Access functions by calling them.
  const res = contract.try_addMethod(BigInt.fromString('10'), BigInt.fromString('20'));
  if (res.reverted) {
    log.debug('Contract eth call reverted', []);
  } else {
    log.debug('Contract eth call result: {}', [res.value.toString()]);
  }
}

export function testStructEthCall (): void {
  log.debug('In test struct eth call', []);

  // Bind the contract to the address that emitted the event.
  // TODO: Address.fromString throws error in WASM module instantiation.
  const contractAddress = dataSource.address();
  const contract = Example1.bind(contractAddress);

  // Access functions by calling them.
  const res = contract.try_structMethod(BigInt.fromString('1000'), BigInt.fromString('500'));
  if (res.reverted) {
    log.debug('Contract eth call reverted', []);
  } else {
    log.debug('Contract eth call result: {}, {}', [res.value.bidAmount1.toString(), res.value.bidAmount2.toString()]);
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

export function testBytesToString (value: string): string {
  log.debug('In test bytesToString', []);

  const byteArray = ByteArray.fromUTF8(value);
  const res = byteArray.toString();
  log.debug('typeConversion.bytesToString result: {}', [res]);

  return res;
}

export function testBytesToBase58 (value: string): string {
  log.debug('In test bytesToBase58', []);

  const byteArray = ByteArray.fromUTF8(value);
  const res = byteArray.toBase58();
  log.debug('typeConversion.bytesToBase58 result: {}', [res]);

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

export function testBigDecimalToString (value: string): string {
  log.debug('In test bigDecimalToString', []);

  const bigDecimal = BigDecimal.fromString(value);
  const res = bigDecimal.toString();
  log.debug('typeConversion.bigIntToString result: {}', [res]);

  return res;
}

export function testBigDecimalFromString (value: string): string {
  log.debug('In test bigDecimal.fromString', []);

  const bigDecimal = BigDecimal.fromString(value);
  const res = bigDecimal.toString();
  log.debug('bigDecimal.FromString result: {}', [res]);

  return res;
}

export function testBigDecimalDividedBy (value1: string, value2: string): string {
  log.debug('In test bigDecimal.dividedBy', []);

  const bigDecimal1 = BigDecimal.fromString(value1);
  const bigDecimal2 = BigDecimal.fromString(value2);

  const res = bigDecimal1 / bigDecimal2;
  log.debug('bigDecimal.dividedBy result: {}', [res.toString()]);

  return res.toString();
}

export function testBigDecimalPlus (value1: string, value2: string): string {
  log.debug('In test bigDecimal.plus', []);

  const bigDecimal1 = BigDecimal.fromString(value1);
  const bigDecimal2 = BigDecimal.fromString(value2);

  const res = bigDecimal1 + bigDecimal2;
  log.debug('bigDecimal.plus result: {}', [res.toString()]);

  return res.toString();
}

export function testBigDecimalMinus (value1: string, value2: string): string {
  log.debug('In test bigDecimal.minus', []);

  const bigDecimal1 = BigDecimal.fromString(value1);
  const bigDecimal2 = BigDecimal.fromString(value2);

  const res = bigDecimal1 - bigDecimal2;
  log.debug('bigDecimal.minus result: {}', [res.toString()]);

  return res.toString();
}

export function testBigDecimalTimes (value1: string, value2: string): string {
  log.debug('In test bigDecimal.times', []);

  const bigDecimal1 = BigDecimal.fromString(value1);
  const bigDecimal2 = BigDecimal.fromString(value2);

  const res = bigDecimal1 * bigDecimal2;
  log.debug('bigDecimal.times result: {}', [res.toString()]);

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

export function testBigIntDividedByDecimal (value1: string, value2: string): string {
  log.debug('In test bigInt.dividedByDecimal', []);

  const bigInt = BigInt.fromString(value1);
  const bigDecimal = BigDecimal.fromString(value2);

  const res = bigInt.divDecimal(bigDecimal);
  log.debug('bigInt.dividedByDecimal result: {}', [res.toString()]);
  return res.toString();
}

export function testBigIntMod (value1: string, value2: string): string {
  log.debug('In test bigInt.mod', []);

  const bigInt1 = BigInt.fromString(value1);
  const bigInt2 = BigInt.fromString(value2);

  const res = bigInt1.mod(bigInt2);
  log.debug('bigInt.mod result: {}', [res.toString()]);
  return res.toString();
}

export function testBigIntBitOr (value1: string, value2: string): string {
  log.debug('In test bigInt.bitOr', []);

  const bigInt1 = BigInt.fromString(value1);
  const bigInt2 = BigInt.fromString(value2);

  const res = bigInt1 | bigInt2;
  log.debug('bigInt.bitOr result: {}', [res.toString()]);
  return res.toString();
}

export function testBigIntBitAnd (value1: string, value2: string): string {
  log.debug('In test bigInt.bitAnd', []);

  const bigInt1 = BigInt.fromString(value1);
  const bigInt2 = BigInt.fromString(value2);

  const res = bigInt1 & bigInt2;
  log.debug('bigInt.bitAnd result: {}', [res.toString()]);
  return res.toString();
}

export function testBigIntLeftShift (value1: string, value2: u8): string {
  log.debug('In test bigInt.leftShift', []);

  const bigInt1 = BigInt.fromString(value1);
  const bits = value2;

  const res = bigInt1 << bits;
  log.debug('bigInt.leftShift result: {}', [res.toString()]);
  return res.toString();
}

export function testBigIntRightShift (value1: string, value2: u8): string {
  log.debug('In test bigInt.RightShift', []);

  const bigInt1 = BigInt.fromString(value1);
  const bits = value2;

  const res = bigInt1 >> bits;
  log.debug('bigInt.RightShift result: {}', [res.toString()]);
  return res.toString();
}

export function testBigIntPow (value1: string, value2: u8): string {
  log.debug('In test bigInt.pow', []);

  const bigInt1 = BigInt.fromString(value1);
  const exp = value2;

  const res = bigInt1.pow(exp);
  log.debug('bigInt.pow result: {}', [res.toString()]);
  return res.toString();
}

export function testBigIntFromString (value: string): string {
  log.debug('In test bigInt.fromString', []);

  const bigInt = BigInt.fromString(value);
  const res = bigInt.toString();
  log.debug('bigInt.FromString result: {}', [res]);

  return res;
}

export function testBigIntWithI32 (value: string): string[] {
  log.debug('In testBigIntWithI32', []);

  const variableI32: i32 = parseInt(value) as i32;

  const bigInt1 = BigInt.fromI32(variableI32);
  const bigInt2 = BigInt.fromString(value);

  const res1 = bigInt1.toString();
  log.debug('bigInt.FromString result 1: {}', [res1]);

  const res2 = bigInt2.toString();
  log.debug('bigInt.FromString result 2: {}', [res2]);

  const res3 = BigInt.compare(bigInt1, bigInt2).toString();
  log.debug('bigInt.FromString result 3: {}', [res3]);

  return [res1, res2, res3];
}

export function testBigIntToHex (value: string): string[] {
  log.debug('In testBigIntToHex', []);

  const variableI32: i32 = parseInt(value) as i32;

  const bigInt1 = BigInt.fromI32(variableI32);
  const bigInt2 = BigInt.fromString(value);

  const res1 = bigInt1.toHex();
  log.debug('bigInt.toHex result 1: {}', [res1]);

  const res2 = bigInt2.toHex();
  log.debug('bigInt.toHex result 2: {}', [res2]);

  return [res1, res2];
}
