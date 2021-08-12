//
// Copyright 2021 Vulcanize, Inc.
//

import { ethers, Contract, Signer } from 'ethers';
import { expect } from 'chai';
import 'mocha';

import { Client as UniClient } from '@vulcanize/uni-watcher';
import { createPool, initializePool } from '@vulcanize/util/test';

export const testCreatePool = async (
  uniClient: UniClient,
  factory: Contract,
  token0Address: string,
  token1Address: string,
  fee: number,
  poolAbi: any,
  signer: Signer): Promise<Contract> => {
  return new Promise((resolve, reject) => {
    (async () => {
      try {
        const subscription = await uniClient.watchEvents((value: any) => {
          // Function gets called with previous events. Check for PoolCreatedEvent.
          if (value.event.__typename === 'PoolCreatedEvent') {
            const expectedContract: string = factory.address;
            const poolAddress = checkPoolCreatedEvent(value, expectedContract, token0Address, token1Address, fee);

            const pool = new ethers.Contract(poolAddress, poolAbi, signer);

            if (subscription) {
              subscription.unsubscribe();
            }
            resolve(pool);
          }
        });

        // Create pool.
        await createPool(factory, token0Address, token1Address, fee);
      } catch (error) {
        reject(error);
      }
    })();
  });
};

export const testInitialize = async (
  uniClient: UniClient,
  pool: Contract,
  sqrtPrice: string,
  tick: number): Promise<void> => {
  return new Promise((resolve, reject) => {
    try {
      (async () => {
        // Subscribe using UniClient.
        const subscription = await uniClient.watchEvents((value: any) => {
          // Function gets called with previous events. Check for InitializeEvent.
          if (value.event.__typename === 'InitializeEvent') {
            const expectedContract: string = pool.address;
            checkInitializeEvent(value, expectedContract, sqrtPrice, tick);

            if (subscription) {
              subscription.unsubscribe();
            }
            resolve();
          }
        });

        // Pool initialize.
        await initializePool(pool, sqrtPrice);
      })();
    } catch (error) {
      reject(error);
    }
  });
};

const checkEventCommonValues = (value: any, expectedContract: string) => {
  expect(value.block).to.not.be.empty;
  expect(value.tx).to.not.be.empty;
  expect(value.contract).to.equal(expectedContract);
  expect(value.eventIndex).to.be.a('number');

  expect(value.proof).to.not.be.empty;
};

export const checkPoolCreatedEvent = (
  value: any,
  expectedContract: string,
  token0Address: string,
  token1Address: string,
  fee: number): string => {
  checkEventCommonValues(value, expectedContract);

  const tokens = new Set([token0Address, token1Address]);
  expect(new Set([value.event.token0, value.event.token1])).to.eql(tokens);
  expect(value.event.fee).to.equal(fee.toString());
  expect(value.event.tickSpacing).to.not.be.empty;
  expect(value.event.pool).to.not.be.empty;

  return value.event.pool;
};

export const checkInitializeEvent = (
  value: any,
  expectedContract: string,
  sqrtPrice: string,
  tick: number): void => {
  checkEventCommonValues(value, expectedContract);

  expect(value.event.sqrtPriceX96).to.equal(sqrtPrice);
  expect(value.event.tick).to.equal(tick.toString());
};

export const checkMintEvent = (
  value: any,
  expectedContract: string,
  expectedSender: string,
  exptectedOwner: string,
  tickLower: number,
  tickUpper: number,
  amount: number): void => {
  checkEventCommonValues(value, expectedContract);

  expect(value.event.sender).to.equal(expectedSender);
  expect(value.event.owner).to.equal(exptectedOwner);
  expect(value.event.tickLower).to.equal(tickLower.toString());
  expect(value.event.tickUpper).to.equal(tickUpper.toString());
  expect(value.event.amount).to.equal(amount.toString());
  expect(value.event.amount0).to.not.be.empty;
  expect(value.event.amount1).to.not.be.empty;
};

export const checkBurnEvent = (
  value: any,
  expectedContract: string,
  exptectedOwner: string,
  tickLower: number,
  tickUpper: number,
  amount: number): void => {
  checkEventCommonValues(value, expectedContract);

  expect(value.event.owner).to.equal(exptectedOwner);
  expect(value.event.tickLower).to.equal(tickLower.toString());
  expect(value.event.tickUpper).to.equal(tickUpper.toString());
  expect(value.event.amount).to.equal(amount.toString());
  expect(value.event.amount0).to.not.be.empty;
  expect(value.event.amount1).to.not.be.empty;
};

export const checkSwapEvent = (
  value: any,
  expectedContract: string,
  expectedSender: string,
  recipient: string,
  sqrtPrice: string,
  tick: number
): void => {
  checkEventCommonValues(value, expectedContract);

  expect(value.event.sender).to.equal(expectedSender);
  expect(value.event.recipient).to.equal(recipient);
  expect(value.event.amount0).to.not.be.empty;
  expect(value.event.amount1).to.not.be.empty;
  expect(value.event.sqrtPriceX96).to.equal(sqrtPrice);
  expect(value.event.liquidity).to.not.be.empty;
  expect(value.event.tick).to.equal(tick.toString());
};

export const checkTransferEvent = (
  value: any,
  expectedContract: string,
  from: string,
  to: string
): void => {
  checkEventCommonValues(value, expectedContract);

  expect(value.event.from).to.equal(from);
  expect(value.event.to).to.equal(to);
};

export const checkIncreaseLiquidityEvent = (
  value: any,
  expectedTokenId: number,
  expectedContract: string,
  amount1Desired: number
): void => {
  checkEventCommonValues(value, expectedContract);

  expect(value.event.tokenId).to.equal(expectedTokenId.toString());
  expect(value.event.liquidity).to.equal(amount1Desired.toString());
  expect(value.event.amount0).to.equal(amount1Desired.toString());
  expect(value.event.amount1).to.equal(amount1Desired.toString());
};

export const checkDecreaseLiquidityEvent = (
  value: any,
  expectedTokenId: number,
  expectedContract: string,
  liquidity: number
): void => {
  checkEventCommonValues(value, expectedContract);

  expect(value.event.tokenId).to.equal(expectedTokenId.toString());
  expect(value.event.liquidity).to.equal(liquidity.toString());
  expect(value.event.amount0).to.not.be.empty;
  expect(value.event.amount1).to.not.be.empty;
};

export const checksCollectEvent = (
  value: any,
  expectedTokenId: number,
  expectedContract: string,
  recipient: string
): void => {
  checkEventCommonValues(value, expectedContract);

  expect(value.event.tokenId).to.equal(expectedTokenId.toString());
  expect(value.event.recipient).to.equal(recipient);
  expect(value.event.amount0).to.not.be.empty;
  expect(value.event.amount1).to.not.be.empty;
};
