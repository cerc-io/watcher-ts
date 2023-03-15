//
// Copyright 2023 Vulcanize, Inc.
//

import debug from 'debug';
import { ethers, Signer } from 'ethers';
import { TransactionResponse } from '@ethersproject/providers';

import { abi as PhisherRegistryABI } from './artifacts/PhisherRegistry.json';

const log = debug('laconic:libp2p-utils');

const contractInterface = new ethers.utils.Interface(PhisherRegistryABI);

const MESSAGE_KINDS = {
  INVOKE: 'invoke',
  REVOKE: 'revoke'
};

export async function sendMessageToLaconic (signer: Signer, contractAddress: string, data: any): Promise<void> {
  const { kind, message } = data;
  const contract = new ethers.Contract(contractAddress, PhisherRegistryABI, signer);

  switch (kind) {
    case MESSAGE_KINDS.INVOKE: {
      const signedInvocations = message;

      const transaction: TransactionResponse = await contract.invoke(signedInvocations);
      const receipt = await transaction.wait();

      log('Transaction receipt', {
        contractAddress: receipt.contractAddress,
        blockNumber: receipt.blockNumber,
        blockHash: receipt.blockHash,
        transactionHash: receipt.transactionHash,
        effectiveGasPrice: receipt.effectiveGasPrice,
        gasUsed: receipt.gasUsed
      });

      break;
    }

    // TODO: Handle revoke messages

    default: {
      log(`Handler for libp2p message kind ${kind} not implemented`);
      log(JSON.stringify(message, null, 2));
      break;
    }
  }
}

export function parseLibp2pMessage (log: debug.Debugger, peerId: string, data: any): void {
  log('Received a message on mobymask P2P network from peer:', peerId);
  const { kind, message } = data;

  switch (kind) {
    case MESSAGE_KINDS.INVOKE: {
      _parseInvocation(log, message);
      break;
    }

    case MESSAGE_KINDS.REVOKE: {
      _parseRevocation(log, message);
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

function _parseInvocation (log: debug.Debugger, msg: any): void {
  log('Signed invocations:');
  log(JSON.stringify(msg, null, 2));

  const [{ invocations: { batch: invocationsList } }] = msg;
  Array.from(invocationsList).forEach((invocation: any) => {
    const txData = invocation.transaction.data;
    const decoded = contractInterface.parseTransaction({ data: txData });

    log(`method: ${decoded.name}, value: ${decoded.args[0]}`);
  });
}

function _parseRevocation (log: debug.Debugger, msg: any): void {
  const { signedDelegation, signedIntendedRevocation } = msg;
  log('Signed delegation:');
  log(JSON.stringify(signedDelegation, null, 2));
  log('Signed intention to revoke:');
  const stringifiedSignedIntendedRevocation = JSON.stringify(
    signedIntendedRevocation,
    (key, value) => {
      if (key === 'delegationHash' && value.type === 'Buffer') {
        // Show hex value for delegationHash instead of Buffer
        return ethers.utils.hexlify(Buffer.from(value));
      }

      return value;
    },
    2
  );
  log(stringifiedSignedIntendedRevocation);
}
