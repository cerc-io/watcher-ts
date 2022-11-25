/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { Address, log, BigInt, BigDecimal, ByteArray, dataSource, ethereum, Bytes, crypto, json, JSONValueKind } from '@graphprotocol/graph-ts';

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

  log.debug('dataSource.network: {}', [dataSource.network()]);
  log.debug('dataSource.context: {}', [dataSource.context().entries.length.toString()]);

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

  // Bind the contract to the address that emitted the event.
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

export function testGetStorageValue (): void {
  log.debug('In test get storage value', []);

  // Bind the contract to the address.
  const contractAddress = dataSource.address();
  Example1.bind(contractAddress);
  const res = ethereum.getStorageValue('_test', []);
  log.debug('Storage call result: {}', [res!.toBigInt().toString()]);
}

export function testMapStorageValue (): void {
  log.debug('In test map storage value', []);

  // Bind the contract to the address.
  const contractAddress = dataSource.address();
  Example1.bind(contractAddress);
  const addressValue = ethereum.Value.fromAddress(Address.zero());
  const res = ethereum.getStorageValue('addressUintMap', [addressValue]);
  log.debug('Storage call result: {}', [res!.toBigInt().toString()]);
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

  return res;
}

export function testBigDecimalDividedBy (value1: string, value2: string): string {
  log.debug('In test bigDecimal.dividedBy', []);

  const bigDecimal1 = BigDecimal.fromString(value1);
  const bigDecimal2 = BigDecimal.fromString(value2);

  const res = bigDecimal1 / bigDecimal2;

  return res.toString();
}

export function testBigDecimalPlus (value1: string, value2: string): string {
  log.debug('In test bigDecimal.plus', []);

  const bigDecimal1 = BigDecimal.fromString(value1);
  const bigDecimal2 = BigDecimal.fromString(value2);

  const res = bigDecimal1 + bigDecimal2;

  return res.toString();
}

export function testBigDecimalMinus (value1: string, value2: string): string {
  log.debug('In test bigDecimal.minus', []);

  const bigDecimal1 = BigDecimal.fromString(value1);
  const bigDecimal2 = BigDecimal.fromString(value2);

  const res = bigDecimal1 - bigDecimal2;

  return res.toString();
}

export function testBigDecimalTimes (value1: string, value2: string): string {
  log.debug('In test bigDecimal.times', []);

  const bigDecimal1 = BigDecimal.fromString(value1);
  const bigDecimal2 = BigDecimal.fromString(value2);

  const res = bigDecimal1 * bigDecimal2;

  return res.toString();
}

export function testBigIntPlus (value1: string, value2: string): string {
  log.debug('In test bigInt.plus', []);

  const bigInt1 = BigInt.fromString(value1);
  const bigInt2 = BigInt.fromString(value2);

  const res = bigInt1 + bigInt2;
  log.debug('bigInt.plus result: {}', [res.toString()]);
  return res.toString();
}

export function testBigIntMinus (value1: string, value2: string): string {
  log.debug('In test bigInt.minus', []);

  const bigInt1 = BigInt.fromString(value1);
  const bigInt2 = BigInt.fromString(value2);

  const res = bigInt1 - bigInt2;
  log.debug('bigInt.minus result: {}', [res.toString()]);
  return res.toString();
}

export function testBigIntTimes (value1: string, value2: string): string {
  log.debug('In test bigInt.times', []);

  const bigInt1 = BigInt.fromString(value1);
  const bigInt2 = BigInt.fromString(value2);

  const res = bigInt1 * bigInt2;
  log.debug('bigInt.times result: {}', [res.toString()]);
  return res.toString();
}

export function testBigIntDividedBy (value1: string, value2: string): string {
  log.debug('In test bigInt.dividedBy', []);

  const bigInt1 = BigInt.fromString(value1);
  const bigInt2 = BigInt.fromString(value2);

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

export function testEthereumEncode (): string {
  const address = ethereum.Value.fromAddress(Address.fromString('0x0000000000000000000000000000000000000420'));
  const bigInt1 = ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(62));
  const bigInt2 = ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(63));
  const bool = ethereum.Value.fromBoolean(true);

  const bytes = ethereum.Value.fromFixedBytes(
    Bytes.fromByteArray(
      ByteArray.fromHexString('0x583bc7e1bc4799a225663353b82eb36d925399e6ef2799a6a95909f5ab8ac945')
    )
  );

  const fixedSizedArray = ethereum.Value.fromFixedSizedArray([
    bigInt1,
    bigInt2
  ]);

  const tupleArray: Array<ethereum.Value> = [
    fixedSizedArray,
    bool
  ];

  const tuple = ethereum.Value.fromTuple(changetype<ethereum.Tuple>(tupleArray));

  const token: Array<ethereum.Value> = [
    address,
    bytes,
    tuple
  ];

  const encoded = ethereum.encode(ethereum.Value.fromTuple(changetype<ethereum.Tuple>(token)))!;

  log.debug('encoded: {}', [encoded.toHex()]);

  return encoded.toHex();
}

export function testEthereumDecode (encoded: string): string[] {
  const decoded = ethereum.decode('(address,bytes32,(uint256[2],bool))', Bytes.fromByteArray(ByteArray.fromHexString(encoded)));
  const tupleValues = decoded!.toTuple();

  const decodedAddress = tupleValues[0].toAddress();
  const decodedBytes = tupleValues[1].toBytes();
  const decodedTuple = tupleValues[2].toTuple();
  const decodedFixedSizedArray = decodedTuple[0].toArray();
  const decodedBigInt1 = decodedFixedSizedArray[0].toBigInt();
  const decodedBigInt2 = decodedFixedSizedArray[1].toBigInt();
  const decodedBool = decodedTuple[1].toBoolean();

  log.debug('decoded address: {}', [decodedAddress.toHex()]);
  log.debug('decoded bytes: {}', [decodedBytes.toHex()]);
  log.debug('decoded bigInt1: {}', [decodedBigInt1.toString()]);
  log.debug('decoded bigInt2: {}', [decodedBigInt2.toString()]);
  log.debug('decoded bool: {}', [decodedBool.toString()]);

  return [
    decodedAddress.toHex(),
    decodedBytes.toHex(),
    decodedBigInt1.toString(),
    decodedBigInt2.toString(),
    decodedBool.toString()
  ];
}

export function testCrypto (hexString: string): string {
  const byteArray = ByteArray.fromHexString(hexString);
  const keccak256 = crypto.keccak256(byteArray);
  const keccak256String = keccak256.toHex();
  log.debug('keccak256 string: {}', [keccak256String]);

  return keccak256String;
}

export function testJsonFromBytes (): void {
  const jsonString = `
  {
    "stringValue": "abc",
    "numberValue": 123,
    "arrayValue": [ 1, 2, 3 ],
    "boolValue": true,
    "nullValue": null
  }
  `;

  const data = Bytes.fromByteArray(
    ByteArray.fromUTF8(jsonString)
  );

  const jsonData = json.fromBytes(data);
  assert(jsonData.kind === JSONValueKind.OBJECT, 'JSON value is not an object');

  const stringValue = jsonData.toObject().get('stringValue')!;
  assert(stringValue.kind === JSONValueKind.STRING, 'JSON value is not a string');

  // https://www.assemblyscript.org/basics.html#triple-equals
  // eslint-disable-next-line eqeqeq
  assert(stringValue.toString() == 'abc', 'JSON object values are not equal');

  const numberValue = jsonData.toObject().get('numberValue')!;
  assert(numberValue.kind === JSONValueKind.NUMBER, 'JSON value is not a number');

  // TODO: Debug json toI64 failing test case.
  // const i64Value = numberValue.toI64();
  // assert(i64Value == 123, 'values are not equal');

  // TODO: Debug json toBigInt failing test case.
  // const bigIntValue = numberValue.toBigInt();
  // assert(bigIntValue.toString() == '123', 'values are not equal');
}

export function testJsonTryFromBytes (): void {
  const incorrectJsonString = `
  {
    stringValue: "abc"
  }
  `;

  let data = Bytes.fromByteArray(
    ByteArray.fromUTF8(incorrectJsonString)
  );

  let jsonResult = json.try_fromBytes(data);
  assert(jsonResult.isError, 'JSON parsing should fail');

  const correctJsonString = `
  {
    "stringValue": "abc"
  }
  `;

  data = Bytes.fromByteArray(
    ByteArray.fromUTF8(correctJsonString)
  );

  jsonResult = json.try_fromBytes(data);
  assert(jsonResult.isOk, 'JSON parsing should be successful');
  const jsonData = jsonResult.value;

  assert(jsonData.kind === JSONValueKind.OBJECT, 'JSON value is not an object');

  const objectValue = jsonData.toObject().get('stringValue')!;
  assert(objectValue.kind === JSONValueKind.STRING, 'JSON value is not a string');

  // https://www.assemblyscript.org/basics.html#triple-equals
  // eslint-disable-next-line eqeqeq
  assert(objectValue.toString() == 'abc', 'JSON object values are not equal');
}
