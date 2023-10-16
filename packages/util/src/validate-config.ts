import { ethers } from 'ethers';
import { Client } from 'pg';
import debug from 'debug';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import WebSocket from 'ws';
import path from 'path';
import fs from 'fs-extra';

import { SUPPORTED_PAID_RPC_METHODS } from './constants';

const log = debug('vulcanize:server');

async function validateContractDeployment (rpcEndpoint: string, contractInfo: {address:string, name?:string}, isWs: boolean): Promise<void> {
  try {
    let provider;
    if (isWs) {
      provider = new ethers.providers.WebSocketProvider(rpcEndpoint);
    } else {
      provider = new ethers.providers.JsonRpcProvider(rpcEndpoint);
    }
    const code = await provider.getCode(contractInfo.address);
    if (code === '0x') {
      log(`WARNING: Contract ${contractInfo.name ? contractInfo.name : ''} is not deployed at ${contractInfo.address}`);
    } else {
      log(`SUCCESS: Contract ${contractInfo.name ? contractInfo.name : ''} is deployed at ${contractInfo.address}`);
    }
  } catch (error) {
    log(error);
  }
}

function validateContractAddressFormat (contractInfo: {address:string, name?:string}): void {
  if (ethers.utils.isAddress(contractInfo.address)) {
    log(`SUCCESS: Address ${contractInfo.address} ${contractInfo.name ? `for ${contractInfo.name}` : ''} is in a valid format`);
  } else {
    log(`WARNING: Address ${contractInfo.address} ${contractInfo.name ? `for ${contractInfo.name}` : ''} is not in a valid format`);
  }
}

export async function validateContracts (contractsArr: {address:string, name?:string}[], rpcProviderMutationEndpoint: string, isWs: boolean): Promise<void> {
  contractsArr.forEach((contract) => {
    validateContractAddressFormat(contract);
    validateContractDeployment(rpcProviderMutationEndpoint, contract, isWs);
  });
}

export async function validateHttpEndpoint (endPoint: string, kind: string): Promise<void> {
  try {
    const response = await fetch(endPoint);
    if (!response.ok) {
      log(`WARNING: HTTP error! for endpoint ${endPoint} Status: ${response.status}`);
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

export async function validateWebSocketEndpoint (wsEndpoint: string): Promise<void> {
  try {
    await checkWebSocket(wsEndpoint);
    log(`The WebSocket endpoint ${wsEndpoint} is running.`);
  } catch (error) {
    log(`WARNING: Error connecting to websocket endpoint ${wsEndpoint}. Please check if server.p2p.nitro.chainUrl is correct.`, error);
  }
}

export async function validatePaidRPCMethods (paidRPCMethods: string[]): Promise<void> {
  paidRPCMethods.forEach((method) => {
    if (SUPPORTED_PAID_RPC_METHODS.includes(method)) {
      log(`SUCESS: ${method} is a supported paid RPC method`);
    } else {
      log(`WARNING: ${method} is not a supported paid RPC method`);
    }
  });
}

export async function validateFilePath (configFile: string): Promise<void> {
  const configFilePath = path.resolve(configFile);
  const fileExists = await fs.pathExists(configFilePath);
  if (!fileExists) {
    log(`WARNING: Config file not found: ${configFilePath}`);
  } else {
    log(`SUCCESS: Config file found: ${configFilePath}`);
  }
}
