import { ethers, utils, Contract, Signer, BigNumber } from 'ethers';
import { expect } from 'chai';
import 'mocha';

import { Client as UniClient } from '@vulcanize/uni-watcher';

// https://github.com/ethers-io/ethers.js/issues/195
export function linkLibraries (
  {
    bytecode,
    linkReferences
  }: {
    bytecode: string
    linkReferences: { [fileName: string]: { [contractName: string]: { length: number; start: number }[] } }
  },
  libraries: { [libraryName: string]: string }): string {
  Object.keys(linkReferences).forEach((fileName) => {
    Object.keys(linkReferences[fileName]).forEach((contractName) => {
      if (!libraries.hasOwnProperty(contractName)) {
        throw new Error(`Missing link library name ${contractName}`);
      }
      const address = utils.getAddress(libraries[contractName]).toLowerCase().slice(2);
      linkReferences[fileName][contractName].forEach(({ start: byteStart, length: byteLength }) => {
        const start = 2 + byteStart * 2;
        const length = byteLength * 2;
        bytecode = bytecode
          .slice(0, start)
          .concat(address)
          .concat(bytecode.slice(start + length, bytecode.length));
      });
    });
  });
  return bytecode;
}

export async function testCreatePool (
  uniClient: UniClient,
  factory: Contract,
  token0: Contract,
  token1: Contract,
  poolAbi: any,
  signer: Signer,
  fee: number): Promise<Contract> {
  return new Promise((resolve, reject) => {
    (async () => {
      try {
        const subscription = await uniClient.watchEvents((value: any) => {
          // Function gets called with previous events. Check for PoolCreatedEvent.
          if (value.event.__typename === 'PoolCreatedEvent') {
            expect(value.block).to.not.be.empty;
            expect(value.tx).to.not.be.empty;
            expect(value.contract).to.equal(factory.address);
            expect(value.eventIndex).to.be.a('number');
            expect(value.event.__typename).to.equal('PoolCreatedEvent');

            const tokens = new Set([token0.address, token1.address]);
            expect(new Set([value.event.token0, value.event.token1])).to.eql(tokens);
            expect(value.event.fee).to.equal(fee.toString());
            expect(value.event.tickSpacing).to.not.be.empty;
            expect(value.event.pool).to.not.be.empty;

            expect(value.proof).to.not.be.empty;
            const poolAddress = value.event.pool;
            const pool = new ethers.Contract(poolAddress, poolAbi, signer);

            if (subscription) {
              subscription.unsubscribe();
            }
            resolve(pool);
          }
        });

        // Create pool.
        await factory.createPool(token0.address, token1.address, fee);
      } catch (error) {
        reject(error);
      }
    })();
  });
}

export function testInitialize (
  uniClient: UniClient,
  pool: Contract,
  expectedTick: number,
  sqrtPrice: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      (async () => {
        // Subscribe using UniClient.
        const subscription = await uniClient.watchEvents((value: any) => {
          // Function gets called with previous events. Check for InitializeEvent.
          if (value.event.__typename === 'InitializeEvent') {
            expect(value.block).to.not.be.empty;
            expect(value.tx).to.not.be.empty;
            expect(value.contract).to.equal(pool.address);
            expect(value.eventIndex).to.be.a('number');

            expect(value.event.__typename).to.equal('InitializeEvent');
            expect(value.event.sqrtPriceX96).to.equal(sqrtPrice);
            expect(value.event.tick).to.equal(expectedTick.toString());

            expect(value.proof).to.not.be.empty;

            if (subscription) {
              subscription.unsubscribe();
            }
            resolve();
          }
        });

        // Pool initialize.
        await pool.initialize(BigNumber.from(sqrtPrice));
      })();
    } catch (error) {
      reject(error);
    }
  });
}
