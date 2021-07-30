import { ethers } from 'ethers';

import { Database } from '../database';

export async function watchContract (db: Database, address: string, kind: string, startingBlock: number): Promise<void> {
  // Always use the checksum address (https://docs.ethers.io/v5/api/utils/address/#utils-getAddress).
  const contractAddress = ethers.utils.getAddress(address);

  await db.saveContract(contractAddress, kind, startingBlock);
}
