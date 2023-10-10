import { ethers } from 'ethers';
import { Client } from 'pg';
import debug from 'debug';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import WebSocket from 'ws';

import { VALID_ETH_RPC_METHODS } from './constants';

const log = debug('vulcanize:server');

async function validateContractDeployment (rpcEndpoint: string, contractAddress: string): Promise<void> {
  try {
    const provider = await new ethers.providers.JsonRpcProvider(rpcEndpoint);
    const code = await provider.getCode(contractAddress);
    if (code === '0x') {
      log(`WARNING: Contract is not deployed at address ${contractAddress}`);
    } else {
      log(`SUCCESS: Contract is deployed at address ${contractAddress}`);
    }
  } catch (error) {
    log(error);
  }
}

function validateContractAddressFormat (contractAddress: string): void {
  if (ethers.utils.isAddress(contractAddress)) {
    log(`SUCCESS: Given contract address ${contractAddress} is in a valid format`);
  } else {
    log(`WARNING: Given contract address ${contractAddress} is not in a valid format`);
  }
}

export async function validateContracts (contractsArr: string[], rpcProviderMutationEndpoint: string): Promise<void> {
  contractsArr.forEach((contractAddr: string) => {
    validateContractAddressFormat(contractAddr);
    validateContractDeployment(rpcProviderMutationEndpoint, contractAddr);
  });
}

export async function validateEndpoint (endPoint: string, kind: string): Promise<void> {
  try {
    const response = await fetch(endPoint);
    if (!response.ok) {
      log(`WARNING: HTTP error! Status: ${response.status}`);
    } else {
      log(`SUCCESS: The ${endPoint} is up`);
    }
  } catch (error:any) {
    log(`WARNING: could not connect to ${endPoint}. Please check if the ${kind} is correct and up.`);
    log(error);
  }
}

async function checkDBEndpoint (connectionString: string, dbKind: string): Promise<void> {
  const client = new Client({
    connectionString
  });

  try {
    await client.connect();
    log(`SUCCESS: ${dbKind} endpoint is up!`);
  } catch (error) {
    log('WARNING: Error connecting to job queue database. Please check if job queue config is setup and database is running \n', error);
  } finally {
    await client.end();
  }
}

export async function validateDatabaseEndpoint (database: PostgresConnectionOptions): Promise<void> {
  const connectionString = `${database.type}://${database.username}:${database.password}@${database.host}:${database.port}/${database.database}`;
  await checkDBEndpoint(connectionString, 'postgresQL');
}

export async function validateJobQueueEndpoint (connString: string): Promise<void> {
  await checkDBEndpoint(connString, 'Job queue database');
}

async function checkWebSocket (wsEndpoint: string) {
  const socket = new WebSocket(wsEndpoint);

  return new Promise((resolve, reject) => {
    socket.on('open', () => {
      socket.close();
      resolve(true);
    });

    socket.on('error', (error) => {
      reject(error);
    });
  });
}

export async function validateNitroChainUrl (wsEndpoint: string): Promise<void> {
  try {
    await checkWebSocket(wsEndpoint);
    log(`The WebSocket endpoint ${wsEndpoint} is running.`);
  } catch (error) {
    log(`WARNING: Error connecting to websocket endpoint ${wsEndpoint}. Please check if server.p2p.nitro.chainUrl is correct.`, error);
  }
}

export async function validateEthRPCMethods (paidRPCMethods: string[]): Promise<void> {
  paidRPCMethods.forEach((method) => {
    if (VALID_ETH_RPC_METHODS.includes(method)) {
      log(`SUCESS: ${method} is a valid JsonRpcMethod`);
    } else {
      log(`WARNING: ${method} is not a valid JsonRpcMethod`);
    }
  });
}
