//
// Copyright 2023 Vulcanize, Inc.
//

import debug from 'debug';
import { ethers, Signer } from 'ethers';
import { TransactionReceipt, TransactionResponse } from '@ethersproject/providers';

import { abi as PhisherRegistryABI } from './artifacts/PhisherRegistry.json';

const log = debug('laconic:libp2p-utils');

const contractInterface = new ethers.utils.Interface(PhisherRegistryABI);

const MESSAGE_KINDS = {
  INVOKE: 'invoke',
  REVOKE: 'revoke'
};

export async function sendMessageToL2 (
  signer: Signer,
  { contractAddress, gasLimit }: {
    contractAddress: string,
    gasLimit: number
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
        const parsedSignedIntendedRevocation = _parseSignedIntendedRevocation(signedIntendedRevocation);

        const transaction: TransactionResponse = await contract.revokeDelegation(
          signedDelegation,
          parsedSignedIntendedRevocation,
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
    _parseSignedIntendedRevocation(signedIntendedRevocation),
    null,
    2
  );
  log(stringifiedSignedIntendedRevocation);
}

function _parseSignedIntendedRevocation (signedIntendedRevocation: any): any {
  // TODO: Parse broadcast messages with types not supported by JSON
  return {
    ...signedIntendedRevocation,
    intentionToRevoke: {
      delegationHash: ethers.utils.hexlify(Buffer.from(signedIntendedRevocation.intentionToRevoke.delegationHash))
    }
  };
}
