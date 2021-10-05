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

/* eslint-disable @typescript-eslint/no-namespace */
export declare namespace test {
  export function asyncMethod(): i32;
}

export function callGraphAPI (): void {
  log.debug('hello {}', ['world']);
}

export function callAsyncMethod (): void {
  log.debug('calling async method', []);
  const res = test.asyncMethod();
  log.debug('res after async: {}', [res.toString()]);
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

export class Bar {
  prop: string

  constructor (prop: string) {
    this.prop = prop;
  }

  getProp (): string {
    return this.prop;
  }
}
