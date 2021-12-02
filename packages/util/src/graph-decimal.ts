//
// Copyright 2021 Vulcanize, Inc.
//

import Decimal from 'decimal.js';

// Constant used in function digitsToString.
const LOG_BASE = 7;

// Customize Decimal according the limits of IEEE-754 decimal128.
// Reference: https://github.com/graphprotocol/graph-node/blob/v0.24.2/graph/src/data/store/scalar.rs#L42
const MIN_EXP = -6143;
const MAX_EXP = 6144;
const PRECISION = 34;
const _GraphDecimal = Decimal.clone({ precision: PRECISION });

// Wrapper class around Decimal.
export class GraphDecimal {
  value: Decimal;

  constructor (n: Decimal.Value) {
    // Apply precision to the input value using toSignificantDigits().
    this.value = new _GraphDecimal(n).toSignificantDigits();
  }

  toString (): string {
    this._checkOutOfRange(this);

    return this.value.toString();
  }

  toFixed (): string {
    this._checkOutOfRange(this);

    return this.value.toFixed();
  }

  plus (n: Decimal.Value | GraphDecimal): GraphDecimal {
    this._checkOutOfRange(this);
    const param = this._checkOutOfRange(n);

    return new GraphDecimal(this.value.plus(param));
  }

  add (n: Decimal.Value | GraphDecimal): GraphDecimal {
    this._checkOutOfRange(this);
    const param = this._checkOutOfRange(n);

    return new GraphDecimal(this.value.add(param));
  }

  minus (n: Decimal.Value | GraphDecimal): GraphDecimal {
    this._checkOutOfRange(this);
    const param = this._checkOutOfRange(n);

    return new GraphDecimal(this.value.minus(param));
  }

  sub (n: Decimal.Value | GraphDecimal): GraphDecimal {
    this._checkOutOfRange(this);
    const param = this._checkOutOfRange(n);

    return new GraphDecimal(this.value.sub(param));
  }

  times (n: Decimal.Value | GraphDecimal): GraphDecimal {
    this._checkOutOfRange(this);
    const param = this._checkOutOfRange(n);

    return new GraphDecimal(this.value.times(param));
  }

  mul (n: Decimal.Value | GraphDecimal): GraphDecimal {
    this._checkOutOfRange(this);
    const param = this._checkOutOfRange(n);

    return new GraphDecimal(this.value.mul(param));
  }

  dividedBy (n: Decimal.Value | GraphDecimal): GraphDecimal {
    this._checkOutOfRange(this);
    const param = this._checkOutOfRange(n);

    return new GraphDecimal(this.value.dividedBy(param));
  }

  div (n: Decimal.Value | GraphDecimal): GraphDecimal {
    this._checkOutOfRange(this);
    const param = this._checkOutOfRange(n);

    return new GraphDecimal(this.value.div(param));
  }

  isZero (): boolean {
    this._checkOutOfRange(this);

    return this.value.isZero();
  }

  lessThan (n: Decimal.Value | GraphDecimal): boolean {
    this._checkOutOfRange(this);
    const param = this._checkOutOfRange(n);

    return this.value.lessThan(param);
  }

  lt (n: Decimal.Value | GraphDecimal): boolean {
    this._checkOutOfRange(this);
    const param = this._checkOutOfRange(n);

    return this.value.lt(param);
  }

  greaterThan (n: Decimal.Value | GraphDecimal): boolean {
    this._checkOutOfRange(this);
    const param = this._checkOutOfRange(n);

    return this.value.lessThan(param);
  }

  gt (n: Decimal.Value | GraphDecimal): boolean {
    this._checkOutOfRange(this);
    const param = this._checkOutOfRange(n);

    return this.value.lessThan(param);
  }

  comparedTo (n: Decimal.Value | GraphDecimal): number {
    this._checkOutOfRange(this);
    const param = this._checkOutOfRange(n);

    return this.value.comparedTo(param);
  }

  cmp (n: Decimal.Value | GraphDecimal): number {
    this._checkOutOfRange(this);
    const param = this._checkOutOfRange(n);

    return this.value.cmp(param);
  }

  /**
   * Function to check and throw an error if a given value has exponent out of the specified range (MIN_EXP to MAX_EXP).
   * @param n A Decimal value to check the range for.
   * @returns A Decimal.Value instance.
   */
  private _checkOutOfRange (n: Decimal.Value | GraphDecimal): Decimal.Value {
    let exp;

    // Return n.value if n is an instance of GraphDecimal.
    if (n instanceof GraphDecimal) {
      n = n.value;
      exp = _getGraphExp(n.d, n.e);
    } else {
      const decimal = new Decimal(n);
      exp = _getGraphExp(decimal.d, decimal.e);
    }

    if (exp < MIN_EXP || exp > MAX_EXP) {
      throw new Error(`Big decimal exponent '${exp}' is outside the '${MIN_EXP}' to '${MAX_EXP}' range`);
    }

    return n;
  }
}

// Get exponent from Decimal d and e according to format in graph-node.
function _getGraphExp (d: any, e: number): number {
  const digits = _digitsToString(d);
  const exp = e - digits.length + 1;

  return exp;
}

// Get digits in a string from an array of digit numbers (Decimal().d)
// https://github.com/MikeMcl/decimal.js/blob/master/decimal.mjs#L2516
function _digitsToString (d: any) {
  let i, k, ws;
  const indexOfLastWord = d.length - 1;
  let str = '';
  let w = d[0];

  if (indexOfLastWord > 0) {
    str += w;
    for (i = 1; i < indexOfLastWord; i++) {
      ws = d[i] + '';
      k = LOG_BASE - ws.length;
      if (k) str += _getZeroString(k);
      str += ws;
    }

    w = d[i];
    ws = w + '';
    k = LOG_BASE - ws.length;
    if (k) str += _getZeroString(k);
  } else if (w === 0) {
    return '0';
  }

  // Remove trailing zeros of last w.
  for (; w % 10 === 0;) w /= 10;

  return str + w;
}

function _getZeroString (k: any) {
  let zs = '';
  for (; k--;) zs += '0';
  return zs;
}
