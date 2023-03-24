//
// Copyright 2023 Vulcanize, Inc.
//

import debug from 'debug';
import { ethers, Signer } from 'ethers';
import { TransactionReceipt, TransactionResponse } from '@ethersproject/providers';

import { abi as PhisherRegistryABI } from './artifacts/PhisherRegistry.json';

const log = debug('vulcanize:libp2p-utils');

const contractInterface = new ethers.utils.Interface(PhisherRegistryABI);

const MESSAGE_KINDS = {
  INVOKE: 'invoke',
  REVOKE: 'revoke'
};

const DEFAULT_GAS_LIMIT = 500000;

export function createMessageToL2Handler (
  signer: Signer,
  { contractAddress, gasLimit }: {
    contractAddress: string,
    gasLimit?: number
  }
) {
  return (peerId: string, data: any): void => {
    log(`[${getCurrentTime()}] Received a message on mobymask P2P network from peer:`, peerId);
    sendMessageToL2(signer, { contractAddress, gasLimit }, data);
  };
}

export async function sendMessageToL2 (
  signer: Signer,
  { contractAddress, gasLimit = DEFAULT_GAS_LIMIT }: {
    contractAddress: string,
    gasLimit?: number
  },
  data: any
): Promise<void> {
  const { kind, message } = data;
  const contract = new ethers.Contract(contractAddress, PhisherRegistryABI, signer);
  let receipt: TransactionReceipt | undefined;

  try {
    switch (kind) {
      case MESSAGE_KINDS.INVOKE: {
        const signedInvocations = message;

        const transaction: TransactionResponse = await contract.invoke(
          signedInvocations,
          // Setting gasLimit as eth_estimateGas call takes too long in L2 chain
          { gasLimit }
        );

        receipt = await transaction.wait();

        break;
      }

      case MESSAGE_KINDS.REVOKE: {
        const { signedDelegation, signedIntendedRevocation } = message;

        const transaction: TransactionResponse = await contract.revokeDelegation(
          signedDelegation,
          signedIntendedRevocation,
          // Setting gasLimit as eth_estimateGas call takes too long in L2 chain
          { gasLimit }
        );

        receipt = await transaction.wait();

        break;
      }

      default: {
        log(`Handler for libp2p message kind ${kind} not implemented`);
        log(JSON.stringify(message, null, 2));
        break;
      }
    }

    if (receipt) {
      log(`Transaction receipt for ${kind} message`, {
        to: receipt.to,
        blockNumber: receipt.blockNumber,
        blockHash: receipt.blockHash,
        transactionHash: receipt.transactionHash,
        effectiveGasPrice: receipt.effectiveGasPrice.toString(),
        gasUsed: receipt.gasUsed.toString()
      });
    }
  } catch (error) {
    log(error);
  }
}

export function parseLibp2pMessage (peerId: string, data: any): void {
  log(`[${getCurrentTime()}] Received a message on mobymask P2P network from peer:`, peerId);
  const { kind, message } = data;

  switch (kind) {
    case MESSAGE_KINDS.INVOKE: {
      _parseInvocation(message);
      break;
    }

    case MESSAGE_KINDS.REVOKE: {
      _parseRevocation(message);
      break;
    }

    default: {
      log(`libp2p message of unknown kind ${kind}`);
      log(JSON.stringify(message, null, 2));
      break;
    }
  }

  log('------------------------------------------');
}

export const getCurrentTime = (): string => {
  const now = new Date();
  return `${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`;
};

function _parseInvocation (msg: any): void {
  log('Signed invocations:');
  log(JSON.stringify(msg, null, 2));

  const [{ invocations: { batch: invocationsList } }] = msg;
  Array.from(invocationsList).forEach((invocation: any) => {
    const txData = invocation.transaction.data;
    const decoded = contractInterface.parseTransaction({ data: txData });

    log(`method: ${decoded.name}, value: ${decoded.args[0]}`);
  });
}

function _parseRevocation (msg: any): void {
  const { signedDelegation, signedIntendedRevocation } = msg;
  log('Signed delegation:');
  log(JSON.stringify(signedDelegation, null, 2));
  log('Signed intention to revoke:');
  log(JSON.stringify(signedIntendedRevocation, null, 2));
}
