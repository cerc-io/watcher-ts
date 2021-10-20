//
// Copyright 2021 Vulcanize, Inc.
//

import { ethers } from 'ethers';

import { Database } from '../database';
import { Client as UniClient } from '../client';

export async function watchContract (db: Database, address: string, kind: string, checkpoint: boolean, startingBlock: number): Promise<void> {
  // Always use the checksum address (https://docs.ethers.io/v5/api/utils/address/#utils-getAddress).
  const contractAddress = ethers.utils.getAddress(address);
  const dbTx = await db.createTransactionRunner();

  try {
    await db.saveContract(dbTx, contractAddress, kind, checkpoint, startingBlock);
    await dbTx.commitTransaction();
  } catch (error) {
    await dbTx.rollbackTransaction();
    throw error;
  } finally {
    await dbTx.release();
  }
}

export const watchEvent = async (uniClient: UniClient, eventType: string): Promise<any> => {
  return new Promise((resolve, reject) => {
    (async () => {
      try {
        const subscription = await uniClient.watchEvents((value: any) => {
          if (value.event.__typename === eventType) {
            if (subscription) {
              subscription.unsubscribe();
            }
            resolve(value);
          }
        });
      } catch (error) {
        reject(error);
      }
    })();
  });
};
