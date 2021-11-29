//
// Copyright 2021 Vulcanize, Inc.
//

// TypeId from https://github.com/graphprotocol/graph-ts/blob/master/global/global.ts
export enum TypeId {
  String = 0,
  ArrayBuffer = 1,
  Int8Array = 2,
  Int16Array = 3,
  Int32Array = 4,
  Int64Array = 5,
  Uint8Array = 6,
  Uint16Array = 7,
  Uint32Array = 8,
  Uint64Array = 9,
  Float32Array = 10,
  Float64Array = 11,
  BigDecimal = 12,
  ArrayBool = 13,
  ArrayUint8Array = 14,
  ArrayEthereumValue = 15,
  ArrayStoreValue = 16,
  ArrayJsonValue = 17,
  ArrayString = 18,
  ArrayEventParam = 19,
  ArrayTypedMapEntryStringJsonValue = 20,
  ArrayTypedMapEntryStringStoreValue = 21,
  SmartContractCall = 22,
  EventParam = 23,
  EthereumTransaction = 24,
  EthereumBlock = 25,
  EthereumCall = 26,
  WrappedTypedMapStringJsonValue = 27,
  WrappedBool = 28,
  WrappedJsonValue = 29,
  EthereumValue = 30,
  StoreValue = 31,
  JsonValue = 32,
  EthereumEvent = 33,
  TypedMapEntryStringStoreValue = 34,
  TypedMapEntryStringJsonValue = 35,
  TypedMapStringStoreValue = 36,
  TypedMapStringJsonValue = 37,
  TypedMapStringTypedMapStringJsonValue = 38,
  ResultTypedMapStringJsonValueBool = 39,
  ResultJsonValueBool = 40,
  ArrayU8 = 41,
  ArrayU16 = 42,
  ArrayU32 = 43,
  ArrayU64 = 44,
  ArrayI8 = 45,
  ArrayI16 = 46,
  ArrayI32 = 47,
  ArrayI64 = 48,
  ArrayF32 = 49,
  ArrayF64 = 50,
  ArrayBigDecimal = 51,
}

// ethereum ValueKind from https://github.com/graphprotocol/graph-ts/blob/master/chain/ethereum.ts#L13
export enum EthereumValueKind {
  ADDRESS = 0,
  FIXED_BYTES = 1,
  BYTES = 2,
  INT = 3,
  UINT = 4,
  BOOL = 5,
  STRING = 6,
  FIXED_ARRAY = 7,
  ARRAY = 8,
  TUPLE = 9,
}

// ValueKind from https://github.com/graphprotocol/graph-ts/blob/master/common/value.ts#L8
export enum ValueKind {
  STRING = 0,
  INT = 1,
  BIGDECIMAL = 2,
  BOOL = 3,
  ARRAY = 4,
  NULL = 5,
  BYTES = 6,
  BIGINT = 7,
}

// log Level from https://github.com/graphprotocol/graph-ts/blob/master/index.ts#L82
export enum Level {
  CRITICAL = 0,
  ERROR = 1,
  WARNING = 2,
  INFO = 3,
  DEBUG = 4,
}
