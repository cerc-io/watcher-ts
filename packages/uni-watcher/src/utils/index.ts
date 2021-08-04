import { ethers } from 'ethers';

import { Database } from '../database';
import { Client as UniClient } from '../client';

export async function watchContract (db: Database, address: string, kind: string, startingBlock: number): Promise<void> {
  // Always use the checksum address (https://docs.ethers.io/v5/api/utils/address/#utils-getAddress).
  const contractAddress = ethers.utils.getAddress(address);

  await db.saveContract(contractAddress, kind, startingBlock);
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
