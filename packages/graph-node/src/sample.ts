// import BN from 'bn.js';
import Decimal from 'decimal.js';
// import Big from 'big.js';

// import BN = _BN.BN;
const GraphDecimal = Decimal.clone({ minE: -6143, maxE: 6144, precision: 34 });

function main () {
  // const bigNum = new BN('115792089237316195423570985008687907853269984665640564039457584007913129639935');
  // console.log('bigNum', bigNum);
  // console.log('bigNum.toArray()', bigNum.toArray());

  // console.log(bigNum.toTwos(264));
  // // console.log(bigNum.bitLength());

  // const x = bigNum.toTwos(264).toArray('le', 33);
  // console.log('x', x, x.length);

  // // const y = new BN(x.toString, )
  // const y = new BN(x, 'le');
  // console.log(y);
  // console.log(y.fromTwos(264));
  // console.log(y.fromTwos(x.length * 8).toString());

  const bigDecimal1 = new GraphDecimal('98786604461865809771125645465456415459845618945610.434395392663499230039565648199676546541956415643156');
  const bigDecimal2 = new GraphDecimal('7878660850');

  console.log(Decimal.minE, Decimal.maxE, Decimal.precision);
  console.log(GraphDecimal.minE, GraphDecimal.maxE, GraphDecimal.precision);

  console.log(bigDecimal1.precision(), bigDecimal2.precision());

  const res = bigDecimal1.dividedBy(bigDecimal2);
  const res2 = new GraphDecimal('012538501953903220719435542839168716782604.70101916').toSignificantDigits();

  console.log(res);
  console.log(res.toPrecision(34));
  console.log(res.toFixed());
  console.log(res.precision());

  console.log(res2);
  // console.log(res2.toPrecision(34));
  console.log(res2.d);
  console.log(res2.e);
  console.log(res2.toFixed());
  console.log(res2.precision());
  console.log(digitsToString(res2.d));

  console.log(bigDecimal1.toFixed());
  console.log(bigDecimal2.toFixed());
}

const LOG_BASE = 7;

function getZeroString (k: any) {
  let zs = '';
  for (; k--;) zs += '0';
  return zs;
}

function digitsToString (d: any) {
  let i, k, ws;
  const indexOfLastWord = d.length - 1;
  let str = '';
  let w = d[0];

  if (indexOfLastWord > 0) {
    str += w;
    for (i = 1; i < indexOfLastWord; i++) {
      ws = d[i] + '';
      k = LOG_BASE - ws.length;
      if (k) str += getZeroString(k);
      str += ws;
    }

    w = d[i];
    ws = w + '';
    k = LOG_BASE - ws.length;
    if (k) str += getZeroString(k);
  } else if (w === 0) {
    return '0';
  }

  // Remove trailing zeros of last w.
  for (; w % 10 === 0;) w /= 10;

  return str + w;
}

main();
