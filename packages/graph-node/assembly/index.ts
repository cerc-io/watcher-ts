import {
  // ethereum,
  // store,
  log
  // ipfs,
  // json,
  // crypto,

  // dataSource,
  // ens,

  // typeConversion,

  // bigDecimal,
  // bigInt,

  // Address,
  // BigDecimal,
  // BigInt,
  // ByteArray,
  // Bytes,
  // DataSourceContext,
  // DataSourceTemplate,
  // Entity,
  // JSONValue,
  // JSONValueKind,
  // JSONValuePayload,
  // Result,
  // TypedMap,
  // TypedMapEntry,
  // Value,
  // ValueKind,
  // ValuePayload,
  // Wrapped
} from '@graphprotocol/graph-ts';

export function callGraphAPI (): void {
  log.debug('hello {}', ['world']);
}

export class Foo {
  static getFoo (): Foo {
    return new Foo();
  }

  getString (): string {
    return 'hello world!';
  }
}

export const FooID = idof<Foo>();
