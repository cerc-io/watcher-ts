//
// Copyright 2021 Vulcanize, Inc.
//

import path from 'path';
import { expect } from 'chai';
import BN from 'bn.js';

import {
  GraphDecimal,
  GraphDatabase,
  UINT128_MAX,
  UINT256_MAX,
  INT256_MIN,
  INT256_MAX,
  DECIMAL128_MIN,
  DECIMAL128_MAX,
  DECIMAL128_PMIN,
  DECIMAL128_NMAX
} from '@cerc-io/util';
import { BaseProvider } from '@ethersproject/providers';

import { instantiate } from './loader';
import { getDummyGraphData, getTestDatabase, getTestIndexer, getTestProvider } from '../test/utils';
import { Indexer } from '../test/utils/indexer';

const EXAMPLE_WASM_FILE_PATH = '../test/subgraph/example1/build/Example1/Example1.wasm';

describe('numbers wasm tests', () => {
  let exports: any;
  let db: GraphDatabase;
  let indexer: Indexer;
  let provider: BaseProvider;

  before(async () => {
    db = getTestDatabase();
    indexer = getTestIndexer();
    provider = getTestProvider();

    const dummyGraphData = getDummyGraphData();
    const filePath = path.resolve(__dirname, EXAMPLE_WASM_FILE_PATH);

    const instance = await instantiate(
      db,
      indexer,
      provider,
      {},
      filePath,
      dummyGraphData
    );
    exports = instance.exports;
    const { _start } = exports;

    // Important to call _start for built subgraphs on instantiation!
    // TODO: Check api version https://github.com/graphprotocol/graph-node/blob/6098daa8955bdfac597cec87080af5449807e874/runtime/wasm/src/module/mod.rs#L533
    _start();
  });

  describe('should execute bigInt fromString API', () => {
    let testBigIntFromString: any, testBigIntWithI32: any, __getString: any, __newString: any, __getArray: any;

    before(() => {
      ({ testBigIntFromString, testBigIntWithI32, __getString, __newString, __getArray } = exports);
    });

    it('should get bigInt for positive numbers', async () => {
      const ptr = await testBigIntFromString(await __newString('923567899898'));
      expect(__getString(ptr)).to.equal('923567899898');
    });

    it('should get bigInt for negative numbers', async () => {
      const ptr = await testBigIntFromString(await __newString('-1506556'));
      expect(__getString(ptr)).to.equal('-1506556');
    });

    it('should give equal values for bigInt fromString and fromI32', async () => {
      const ptr = await testBigIntWithI32(await __newString('-1506556'));
      const ptrs = __getArray(ptr);

      expect(__getString(ptrs[0])).to.equal(__getString(ptrs[1]));
      expect(__getString(ptrs[2])).to.equal('0');
    });

    it('should get bigInt for INT256_MIN', async () => {
      const ptr = await testBigIntFromString(await __newString(INT256_MIN));
      expect(__getString(ptr)).to.equal(INT256_MIN);
    });

    it('should get bigInt for INT256_MAX', async () => {
      const ptr = await testBigIntFromString(await __newString(INT256_MAX));
      expect(__getString(ptr)).to.equal(INT256_MAX);
    });

    it('should get bigInt for UINT256_MAX', async () => {
      const ptr = await testBigIntFromString(await __newString(UINT256_MAX));
      expect(__getString(ptr)).to.equal(UINT256_MAX);
    });
  });

  describe('should execute bigInt plus API', () => {
    let testBigIntPlus: any, __getString: any, __newString: any;

    before(() => {
      ({ testBigIntPlus, __getString, __newString } = exports);
    });

    it('should execute bigInt plus for positive numbers', async () => {
      const ptr = await testBigIntPlus(await __newString('923567899898'), await __newString('89456153132132'));
      expect(__getString(ptr)).to.equal('90379721032030');
    });

    it('should execute bigInt plus for INT256_MAX and INT256_MAX', async () => {
      const ptr = await testBigIntPlus(await __newString(INT256_MAX), await __newString(INT256_MAX));
      expect(__getString(ptr)).to.equal('115792089237316195423570985008687907853269984665640564039457584007913129639934');
    });

    it('should execute bigInt plus for INT256_MIN and INT256_MIN', async () => {
      const ptr = await testBigIntPlus(await __newString(INT256_MIN), await __newString(INT256_MIN));
      expect(__getString(ptr)).to.equal('-115792089237316195423570985008687907853269984665640564039457584007913129639936');
    });

    it('should execute bigInt plus for INT256_MAX and INT256_MIN', async () => {
      const ptr = await testBigIntPlus(await __newString(INT256_MAX), await __newString(INT256_MIN));
      expect(__getString(ptr)).to.equal('-1');
    });
  });

  describe('should execute bigInt minus API', () => {
    let testBigIntMinus: any, __getString: any, __newString: any;

    before(() => {
      ({ testBigIntMinus, __getString, __newString } = exports);
    });

    it('should execute bigInt minus for positive numbers', async () => {
      const ptr = await testBigIntMinus(await __newString('923567899898'), await __newString('89456153132132'));
      expect(__getString(ptr)).to.equal('-88532585232234');
    });

    it('should execute bigInt minus for UINT256_MAX and UINT256_MAX', async () => {
      const ptr = await testBigIntMinus(await __newString(UINT256_MAX), await __newString(UINT256_MAX));
      expect(__getString(ptr)).to.equal('0');
    });

    it('should execute bigInt minus for INT256_MIN and INT256_MIN', async () => {
      const ptr = await testBigIntMinus(await __newString(INT256_MIN), await __newString(INT256_MIN));
      expect(__getString(ptr)).to.equal('0');
    });

    it('should execute bigInt minus for INT256_MAX and INT256_MIN', async () => {
      const ptr = await testBigIntMinus(await __newString(INT256_MAX), await __newString(INT256_MIN));
      expect(__getString(ptr)).to.equal(UINT256_MAX);
    });

    it('should execute bigInt minus for INT256_MIN and INT256_MAX', async () => {
      const ptr = await testBigIntMinus(await __newString(INT256_MIN), await __newString(INT256_MAX));
      expect(__getString(ptr)).to.equal(`-${UINT256_MAX}`);
    });
  });

  describe('should execute bigInt times API', () => {
    let testBigIntTimes: any, __getString: any, __newString: any;

    before(() => {
      ({ testBigIntTimes, __getString, __newString } = exports);
    });

    it('should execute bigInt times for positive numbers', async () => {
      const ptr = await testBigIntTimes(await __newString('923567899898'), await __newString('89456153132132'));
      expect(__getString(ptr)).to.equal('82618831481197046143322536');
    });

    it('should execute bigInt times for UINT128_MAX and UINT128_MAX', async () => {
      const ptr = await testBigIntTimes(await __newString(UINT128_MAX), await __newString(UINT128_MAX));
      expect(__getString(ptr)).to.equal('115792089237316195423570985008687907852589419931798687112530834793049593217025');
    });

    it('should execute bigInt times for -UINT128_MAX and UINT128_MAX', async () => {
      const ptr = await testBigIntTimes(await __newString(`-${UINT128_MAX}`), await __newString(UINT128_MAX));
      expect(__getString(ptr)).to.equal('-115792089237316195423570985008687907852589419931798687112530834793049593217025');
    });

    it('should execute bigInt times for -UINT128_MAX and -UINT128_MAX', async () => {
      const ptr = await testBigIntTimes(await __newString(`-${UINT128_MAX}`), await __newString(`-${UINT128_MAX}`));
      expect(__getString(ptr)).to.equal('115792089237316195423570985008687907852589419931798687112530834793049593217025');
    });

    it('should execute bigInt times for UINT256_MAX and 0', async () => {
      const ptr = await testBigIntTimes(await __newString(UINT256_MAX), await __newString('0'));
      expect(__getString(ptr)).to.equal('0');
    });

    it('should execute bigInt times for 0 and 0', async () => {
      const ptr = await testBigIntTimes(await __newString('0'), await __newString('0'));
      expect(__getString(ptr)).to.equal('0');
    });

    it('should execute bigInt times for INT256_MIN and UINT256_MAX', async () => {
      const ptr = await testBigIntTimes(await __newString(INT256_MIN), await __newString(UINT256_MAX));
      const expected = new BN(INT256_MIN).mul(new BN(UINT256_MAX)).toString();
      expect(__getString(ptr)).to.equal(expected);
    });
  });

  describe('should execute bigInt dividedBy API', () => {
    let testBigIntDividedBy: any, __getString: any, __newString: any;

    before(() => {
      ({ testBigIntDividedBy, __getString, __newString } = exports);
    });

    it('should execute bigInt dividedBy for positive numbers', async () => {
      const ptr = await testBigIntDividedBy(await __newString('82618831481197046143322536'), await __newString('89456153132132'));
      expect(__getString(ptr)).to.equal('923567899898');
    });

    it('should execute bigInt dividedBy for UINT256_MAX and UINT256_MAX', async () => {
      const ptr = await testBigIntDividedBy(await __newString(UINT256_MAX), await __newString(UINT256_MAX));
      expect(__getString(ptr)).to.equal('1');
    });

    it('should execute bigInt dividedBy for -UINT256_MAX and UINT256_MAX', async () => {
      const ptr = await testBigIntDividedBy(await __newString(`-${UINT256_MAX}`), await __newString(UINT256_MAX));
      expect(__getString(ptr)).to.equal('-1');
    });

    it('should execute bigInt dividedBy for -UINT256_MAX and -UINT256_MAX', async () => {
      const ptr = await testBigIntDividedBy(await __newString(`-${UINT256_MAX}`), await __newString(`-${UINT256_MAX}`));
      expect(__getString(ptr)).to.equal('1');
    });

    it('should execute bigInt dividedBy for UINT256_MAX and -UINT256_MAX', async () => {
      const ptr = await testBigIntDividedBy(await __newString(UINT256_MAX), await __newString(`-${UINT256_MAX}`));
      expect(__getString(ptr)).to.equal('-1');
    });

    it('should execute bigInt dividedBy for UINT256_MAX and INT256_MAX', async () => {
      const ptr = await testBigIntDividedBy(await __newString(UINT256_MAX), await __newString(INT256_MAX));
      expect(__getString(ptr)).to.equal('2');
    });

    it('should execute bigInt dividedBy for 0 and UINT256_MAX', async () => {
      const ptr = await testBigIntDividedBy(await __newString('0'), await __newString(UINT256_MAX));
      expect(__getString(ptr)).to.equal('0');
    });
  });

  describe('should execute bigInt dividedByDecimal API', async () => {
    let testBigIntDividedByDecimal: any, __newString: any, __getString: any;

    before(() => {
      ({ testBigIntDividedByDecimal, __newString, __getString } = exports);
    });

    it('should execute bigInt dividedByDecimal for positive dividend and positive divisor', async () => {
      const ptr = await testBigIntDividedByDecimal(await __newString('231543212213235645154'), await __newString('552.65645'));
      expect(__getString(ptr)).to.equal('418964100053904455.7500414588484401');
    });

    it('should execute bigInt dividedByDecimal for negative dividend and positive divisor', async () => {
      const ptr = await testBigIntDividedByDecimal(await __newString('-231543212213235645154'), await __newString('552.65645'));
      expect(__getString(ptr)).to.equal('-418964100053904455.7500414588484401');
    });

    it('should execute bigInt dividedByDecimal for positive dividend and negative divisor', async () => {
      const ptr = await testBigIntDividedByDecimal(await __newString('231543212213235645154'), await __newString('-552.65645'));
      expect(__getString(ptr)).to.equal('-418964100053904455.7500414588484401');
    });

    it('should execute bigInt dividedByDecimal for negative dividend and negative divisor', async () => {
      const ptr = await testBigIntDividedByDecimal(await __newString('-231543212213235645154'), await __newString('-552.65645'));
      expect(__getString(ptr)).to.equal('418964100053904455.7500414588484401');
    });
  });

  describe('should execute bigInt mod API', () => {
    let testBigIntMod: any, __getString: any, __newString: any;

    before(() => {
      ({ testBigIntMod, __getString, __newString } = exports);
    });

    it('should execute bigInt mod for positive dividend and positive divisor', async () => {
      const ptr = await testBigIntMod(await __newString('2315432122132354'), await __newString('5465265645'));
      expect(__getString(ptr)).to.equal('1283174719');
    });

    it('should execute bigInt mod for negative dividend and positive divisor', async () => {
      const ptr = await testBigIntMod(await __newString('-2315432122132354'), await __newString('5465265645'));
      expect(__getString(ptr)).to.equal('4182090926');
    });

    it('should execute bigInt dividedBy for UINT256_MAX and UINT256_MAX', async () => {
      const ptr = await testBigIntMod(await __newString(UINT256_MAX), await __newString(UINT256_MAX));
      expect(__getString(ptr)).to.equal('0');
    });
  });

  it('should execute bigInt bitOr API', async () => {
    const { testBigIntBitOr, __getString, __newString } = exports;

    const ptr = await testBigIntBitOr(await __newString('2315432122132354'), await __newString('5465265645'));
    expect(__getString(ptr)).to.equal('2315433208543215');
  });

  it('should execute bigInt bitAnd API', async () => {
    const { testBigIntBitAnd, __getString, __newString } = exports;

    const ptr = await testBigIntBitAnd(await __newString('2315432122132354'), await __newString('5465265645'));
    expect(__getString(ptr)).to.equal('4378854784');
  });

  it('should execute bigInt leftShift API', async () => {
    const { testBigIntLeftShift, __getString, __newString } = exports;

    const ptr = await testBigIntLeftShift(await __newString('2315432122132354'), 3);
    expect(__getString(ptr)).to.equal('18523456977058832');
  });

  it('should execute bigInt rightShift API', async () => {
    const { testBigIntRightShift, __getString, __newString } = exports;

    const ptr = await testBigIntRightShift(await __newString('2315432122132354'), 3);
    expect(__getString(ptr)).to.equal('289429015266544');
  });

  it('should execute bigInt pow API', async () => {
    const { testBigIntPow, __getString, __newString } = exports;

    const ptr = await testBigIntPow(await __newString('2315432'), 5);
    expect(__getString(ptr)).to.equal('66551853520489467542782546706432');
  });

  it('should execute bigDecimal toString API', async () => {
    const { testBigDecimalToString, __newString, __getString } = exports;

    const ptr = await testBigDecimalToString(await __newString('-5032485723458348569331745849735.3343434634691214453454356561'));
    expect(__getString(ptr)).to.equal('-5032485723458348569331745849735.334');
  });

  describe('should execute bigDecimal fromString API', () => {
    let testBigDecimalFromString: any, __getString: any, __newString: any;

    before(() => {
      ({ testBigDecimalFromString, __getString, __newString } = exports);
    });

    it('should get bigDecimal for numbers without decimals', async () => {
      const ptr = await testBigDecimalFromString(await __newString('4.321e+4'));
      expect(__getString(ptr)).to.equal('43210');
    });

    it('should get bigDecimal for number with negative exponent', async () => {
      const ptr = await testBigDecimalFromString(await __newString('4.32184561e-30'));
      expect(__getString(ptr)).to.equal('0.00000000000000000000000000000432184561');
    });

    it('should get bigDecimal for decimal number having more than 34 digits', async () => {
      const ptr = await testBigDecimalFromString(await __newString('-5032485723458348569331745849735.3343434634691214453454356561'));
      expect(__getString(ptr)).to.equal('-5032485723458348569331745849735.334');
    });

    it('should get bigDecimal for decimal number with whole part having more than 34 digits', async () => {
      const ptr = await testBigDecimalFromString(await __newString('1157920892373161954235709850086879078532699846.65640564039457584007913129639935'));
      expect(__getString(ptr)).to.equal('1157920892373161954235709850086879000000000000');
    });

    it('should get bigDecimal for UINT256_MAX', async () => {
      const ptr = await testBigDecimalFromString(await __newString(UINT256_MAX));
      expect(__getString(ptr)).to.equal('115792089237316195423570985008687900000000000000000000000000000000000000000000');
    });

    it('should get bigDecimal for 0000.000000000', async () => {
      const ptr = await testBigDecimalFromString(await __newString('0000.000000000'));
      expect(__getString(ptr)).to.equal('0');
    });

    it('should get bigDecimal for DECIMAL128_MAX', async () => {
      const ptr = await testBigDecimalFromString(await __newString(DECIMAL128_MAX));
      const expected = new GraphDecimal(DECIMAL128_MAX).toFixed();
      expect(__getString(ptr)).to.equal(expected);
    });

    it('should get bigDecimal for DECIMAL128_MIN', async () => {
      const ptr = await testBigDecimalFromString(await __newString(DECIMAL128_MIN));
      const expected = new GraphDecimal(DECIMAL128_MIN).toFixed();
      expect(__getString(ptr)).to.equal(expected);
    });

    it('should get bigDecimal for DECIMAL128_NMAX', async () => {
      const ptr = await testBigDecimalFromString(await __newString(DECIMAL128_NMAX));
      const expected = new GraphDecimal(DECIMAL128_NMAX).toFixed();
      expect(__getString(ptr)).to.equal(expected);
    });

    it('should get bigDecimal for DECIMAL128_PMIN', async () => {
      const ptr = await testBigDecimalFromString(await __newString(DECIMAL128_PMIN));
      const expected = new GraphDecimal(DECIMAL128_PMIN).toFixed();
      expect(__getString(ptr)).to.equal(expected);
    });
  });

  describe('should execute bigDecimal plus API', () => {
    let testBigDecimalPlus: any, __getString: any, __newString: any;

    before(() => {
      ({ testBigDecimalPlus, __getString, __newString } = exports);
    });

    it('should execute bigDecimal plus for positive decimals', async () => {
      const ptr = await testBigDecimalPlus(await __newString('231543212.2132354'), await __newString('54652.65645'));
      expect(__getString(ptr)).to.equal('231597864.8696854');
    });

    it('should execute bigDecimal plus for DECIMAL128_MAX and 0', async () => {
      const ptr = await testBigDecimalPlus(await __newString(DECIMAL128_MAX), await __newString('0'));
      const expected = new GraphDecimal(DECIMAL128_MAX).toFixed();
      expect(__getString(ptr)).to.equal(expected);
    });

    it('should execute bigDecimal plus for DECIMAL128_MIN and 0', async () => {
      const ptr = await testBigDecimalPlus(await __newString(DECIMAL128_MIN), await __newString('0'));
      const expected = new GraphDecimal(DECIMAL128_MIN).toFixed();
      expect(__getString(ptr)).to.equal(expected);
    });

    it('should execute bigDecimal plus for DECIMAL128_PMIN and 0', async () => {
      const ptr = await testBigDecimalPlus(await __newString(DECIMAL128_PMIN), await __newString('0'));
      const expected = new GraphDecimal(DECIMAL128_PMIN).toFixed();
      expect(__getString(ptr)).to.equal(expected);
    });

    it('should execute bigDecimal plus for DECIMAL128_NMAX and 0', async () => {
      const ptr = await testBigDecimalPlus(await __newString(DECIMAL128_NMAX), await __newString('0'));
      const expected = new GraphDecimal(DECIMAL128_NMAX).toFixed();
      expect(__getString(ptr)).to.equal(expected);
    });

    it('should execute bigDecimal plus for DECIMAL128_MAX and DECIMAL128_MIN', async () => {
      const ptr = await testBigDecimalPlus(await __newString(DECIMAL128_MAX), await __newString(DECIMAL128_MIN));
      const expected = new GraphDecimal('0').toFixed();
      expect(__getString(ptr)).to.equal(expected);
    });

    it('should execute bigDecimal plus for DECIMAL128_PMIN and DECIMAL128_NMAX', async () => {
      const ptr = await testBigDecimalPlus(await __newString(DECIMAL128_PMIN), await __newString(DECIMAL128_NMAX));
      const expected = new GraphDecimal('0').toFixed();
      expect(__getString(ptr)).to.equal(expected);
    });
  });

  describe('should execute bigDecimal minus API', () => {
    let testBigDecimalMinus: any, __getString: any, __newString: any;

    before(() => {
      ({ testBigDecimalMinus, __getString, __newString } = exports);
    });

    it('should execute bigDecimal minus for positive decimals', async () => {
      const ptr = await testBigDecimalMinus(await __newString('231543212.2132354'), await __newString('54652.65645'));
      expect(__getString(ptr)).to.equal('231488559.5567854');
    });

    it('should execute bigDecimal minus for DECIMAL128_MAX and 0', async () => {
      const ptr = await testBigDecimalMinus(await __newString(DECIMAL128_MAX), await __newString('0'));
      const expected = new GraphDecimal(DECIMAL128_MAX).toFixed();
      expect(__getString(ptr)).to.equal(expected);
    });

    it('should execute bigDecimal minus for 0 and DECIMAL128_MAX', async () => {
      const ptr = await testBigDecimalMinus(await __newString('0'), await __newString(DECIMAL128_MAX));
      const expected = new GraphDecimal(DECIMAL128_MIN).toFixed();
      expect(__getString(ptr)).to.equal(expected);
    });

    it('should execute bigDecimal minus for DECIMAL128_MIN and 0', async () => {
      const ptr = await testBigDecimalMinus(await __newString(DECIMAL128_MIN), await __newString('0'));
      const expected = new GraphDecimal(DECIMAL128_MIN).toFixed();
      expect(__getString(ptr)).to.equal(expected);
    });

    it('should execute bigDecimal minus for 0 and DECIMAL128_MIN', async () => {
      const ptr = await testBigDecimalMinus(await __newString('0'), await __newString(DECIMAL128_MIN));
      const expected = new GraphDecimal(DECIMAL128_MAX).toFixed();
      expect(__getString(ptr)).to.equal(expected);
    });

    it('should execute bigDecimal minus for DECIMAL128_PMIN and 0', async () => {
      const ptr = await testBigDecimalMinus(await __newString(DECIMAL128_PMIN), await __newString('0'));
      const expected = new GraphDecimal(DECIMAL128_PMIN).toFixed();
      expect(__getString(ptr)).to.equal(expected);
    });

    it('should execute bigDecimal minus for 0 and DECIMAL128_PMIN', async () => {
      const ptr = await testBigDecimalMinus(await __newString('0'), await __newString(DECIMAL128_PMIN));
      const expected = new GraphDecimal(DECIMAL128_NMAX).toFixed();
      expect(__getString(ptr)).to.equal(expected);
    });

    it('should execute bigDecimal minus for DECIMAL128_NMAX and 0', async () => {
      const ptr = await testBigDecimalMinus(await __newString(DECIMAL128_NMAX), await __newString('0'));
      const expected = new GraphDecimal(DECIMAL128_NMAX).toFixed();
      expect(__getString(ptr)).to.equal(expected);
    });

    it('should execute bigDecimal minus for 0 and DECIMAL128_NMAX', async () => {
      const ptr = await testBigDecimalMinus(await __newString('0'), await __newString(DECIMAL128_NMAX));
      const expected = new GraphDecimal(DECIMAL128_PMIN).toFixed();
      expect(__getString(ptr)).to.equal(expected);
    });

    it('should execute bigDecimal minus for DECIMAL128_MIN and DECIMAL128_MIN', async () => {
      const ptr = await testBigDecimalMinus(await __newString(DECIMAL128_MIN), await __newString(DECIMAL128_MIN));
      const expected = new GraphDecimal('0').toFixed();
      expect(__getString(ptr)).to.equal(expected);
    });

    it('should execute bigDecimal minus for DECIMAL128_PMIN and DECIMAL128_PMIN', async () => {
      const ptr = await testBigDecimalMinus(await __newString(DECIMAL128_PMIN), await __newString(DECIMAL128_PMIN));
      const expected = new GraphDecimal('0').toFixed();
      expect(__getString(ptr)).to.equal(expected);
    });
  });

  describe('should execute bigDecimal times API', () => {
    let testBigDecimalTimes: any, __getString: any, __newString: any;

    before(() => {
      ({ testBigDecimalTimes, __getString, __newString } = exports);
    });

    it('should execute bigDecimal times for positive decimals', async () => {
      const ptr = await testBigDecimalTimes(await __newString('231543212.2132354'), await __newString('54652.65645'));
      expect(__getString(ptr)).to.equal('12654451630419.39845917833');
    });

    it('should execute bigDecimal times for positive and negative decimal', async () => {
      const ptr = await testBigDecimalTimes(await __newString('231543212.2132354'), await __newString('-54652.65645'));
      expect(__getString(ptr)).to.equal('-12654451630419.39845917833');
    });

    it('should execute bigDecimal times for positive decimal and 0', async () => {
      const ptr = await testBigDecimalTimes(await __newString('231543212.2132354'), await __newString('0'));
      expect(__getString(ptr)).to.equal('0');
    });

    it('should execute bigDecimal times for 0 and 0', async () => {
      const ptr = await testBigDecimalTimes(await __newString('0'), await __newString('0'));
      expect(__getString(ptr)).to.equal('0');
    });

    it('should execute bigDecimal times for DECIMAL128_MAX and 1', async () => {
      const ptr = await testBigDecimalTimes(await __newString(DECIMAL128_MAX), await __newString('1'));
      const expected = new GraphDecimal(DECIMAL128_MAX).toFixed();
      expect(__getString(ptr)).to.equal(expected);
    });

    it('should execute bigDecimal times for DECIMAL128_MAX and -1', async () => {
      const ptr = await testBigDecimalTimes(await __newString(DECIMAL128_MAX), await __newString('-1'));
      const expected = new GraphDecimal(DECIMAL128_MIN).toFixed();
      expect(__getString(ptr)).to.equal(expected);
    });

    it('should execute bigDecimal times for DECIMAL128_PMIN and 1', async () => {
      const ptr = await testBigDecimalTimes(await __newString(DECIMAL128_PMIN), await __newString('1'));
      const expected = new GraphDecimal(DECIMAL128_PMIN).toFixed();
      expect(__getString(ptr)).to.equal(expected);
    });

    it('should execute bigDecimal times for DECIMAL128_PMIN and -1', async () => {
      const ptr = await testBigDecimalTimes(await __newString(DECIMAL128_PMIN), await __newString('-1'));
      const expected = new GraphDecimal(DECIMAL128_NMAX).toFixed();
      expect(__getString(ptr)).to.equal(expected);
    });

    it('should throw an error for DECIMAL128_PMIN times DECIMAL128_NMAX', async () => {
      try {
        await testBigDecimalTimes(await __newString(DECIMAL128_PMIN), await __newString(DECIMAL128_NMAX));
      } catch (error: any) {
        expect(error.message).to.be.equal('Big decimal exponent \'-12286\' is outside the \'-6143\' to \'6144\' range');
      }
    });

    it('should execute bigDecimal times for DECIMAL128_MAX and DECIMAL128_NMAX', async () => {
      const ptr = await testBigDecimalTimes(await __newString(DECIMAL128_MAX), await __newString(DECIMAL128_NMAX));
      const expected = new GraphDecimal('-99.99999999999999999999999999999999').toFixed();
      expect(__getString(ptr)).to.equal(expected);
    });
  });

  describe('should execute bigDecimal dividedBy API', () => {
    let testBigDecimalDividedBy: any, __getString: any, __newString: any;

    before(() => {
      ({ testBigDecimalDividedBy, __getString, __newString } = exports);
    });

    it('should execute bigDecimal dividedBy for positive decimals', async () => {
      const ptr = await testBigDecimalDividedBy(await __newString('231543212.2132354'), await __newString('54652.65645'));
      expect(__getString(ptr)).to.equal('4236.632347872550667205491344419362');
    });

    it('should execute bigDecimal dividedBy for negative decimal and DECIMAL128_MAX', async () => {
      const ptr = await testBigDecimalDividedBy(await __newString('-10000.00'), await __newString(DECIMAL128_MAX));
      const expected = new GraphDecimal('-1e-6141').toFixed();
      expect(__getString(ptr)).to.equal(expected);
    });

    it('should execute bigDecimal dividedBy for DECIMAL128_MAX and DECIMAL128_MAX', async () => {
      const ptr = await testBigDecimalDividedBy(await __newString(DECIMAL128_MAX), await __newString(DECIMAL128_MAX));
      const expected = new GraphDecimal('1').toFixed();
      expect(__getString(ptr)).to.equal(expected);
    });

    it('should execute bigDecimal dividedBy for DECIMAL128_MAX and DECIMAL128_MIN', async () => {
      const ptr = await testBigDecimalDividedBy(await __newString(DECIMAL128_MAX), await __newString(DECIMAL128_MIN));
      const expected = new GraphDecimal('-1').toFixed();
      expect(__getString(ptr)).to.equal(expected);
    });

    it('should throw an error for DECIMAL128_PMIN divideBy DECIMAL128_MAX', async () => {
      try {
        await testBigDecimalDividedBy(await __newString(DECIMAL128_PMIN), await __newString(DECIMAL128_MAX));
      } catch (error: any) {
        expect(error.message).to.be.equal('Big decimal exponent \'-12288\' is outside the \'-6143\' to \'6144\' range');
      }
    });

    it('should execute bigDecimal dividedBy for 0 and DECIMAL128_MAX', async () => {
      const ptr = await testBigDecimalDividedBy(await __newString('0'), await __newString(DECIMAL128_MAX));
      const expected = new GraphDecimal('0').toFixed();
      expect(__getString(ptr)).to.equal(expected);
    });

    it('should execute bigDecimal dividedBy for DECIMAL128_PMIN and DECIMAL128_NMAX', async () => {
      const ptr = await testBigDecimalDividedBy(await __newString(DECIMAL128_PMIN), await __newString(DECIMAL128_NMAX));
      const expected = new GraphDecimal('-1').toFixed();
      expect(__getString(ptr)).to.equal(expected);
    });
  });
});
