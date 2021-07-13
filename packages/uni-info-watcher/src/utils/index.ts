import Decimal from 'decimal.js';
import { BigNumber } from 'ethers';

import { Transaction } from '../entity/Transaction';
import { Database } from '../database';

export const exponentToBigDecimal = (decimals: bigint): Decimal => {
  let bd = new Decimal(1);

  for (let i = 0; BigNumber.from(decimals).gte(i); i++) {
    bd = bd.times(10);
  }

  return bd;
};

export const convertTokenToDecimal = (tokenAmount: bigint, exchangeDecimals: bigint): Decimal => {
  if (exchangeDecimals === BigInt(0)) {
    return new Decimal(tokenAmount.toString());
  }

  return (new Decimal(tokenAmount.toString())).div(exponentToBigDecimal(exchangeDecimals));
};

export const loadTransaction = async (db: Database, event: { txHash: string, blockNumber: number, blockTimestamp: number }): Promise<Transaction> => {
  const { txHash, blockNumber, blockTimestamp } = event;

  const transaction = await db.loadTransaction({
    id: txHash,
    blockNumber,
    timestamp: BigInt(blockTimestamp)
  });

  transaction.blockNumber = blockNumber;
  transaction.timestamp = BigInt(blockTimestamp);

  return db.saveTransaction(transaction, blockNumber);
};

// Return 0 if denominator is 0 in division.
export const safeDiv = (amount0: Decimal, amount1: Decimal): Decimal => {
  if (amount1.isZero()) {
    return new Decimal(0);
  } else {
    return amount0.div(amount1);
  }
};

export const bigDecimalExponated = (value: Decimal, power: bigint): Decimal => {
  if (power === BigInt(0)) {
    return new Decimal(1);
  }

  const negativePower = power > BigInt(0);
  let result = (new Decimal(0)).plus(value);
  const powerAbs = BigNumber.from(power).abs();

  for (let i = BigNumber.from(1); i.lt(powerAbs); i = i.add(1)) {
    result = result.times(value);
  }

  if (negativePower) {
    result = safeDiv(new Decimal(1), result);
  }

  return result;
};
