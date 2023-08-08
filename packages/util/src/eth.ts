import debug from 'debug';
import { UnsignedTransaction, utils } from 'ethers';

import { TransactionResponse } from '@ethersproject/providers';
import { SignatureLike } from '@ethersproject/bytes';

const log = debug('vulcanize:eth');

interface Header {
  Parent: string;
  UnclesDigest: string;
  Beneficiary: string;
  StateRoot: string;
  TxRoot: string;
  RctRoot: string;
  Bloom: string;
  Difficulty: bigint;
  Number: bigint;
  GasLimit: bigint;
  GasUsed: bigint;
  Time: number,
  Extra: string;
  MixDigest: string;
  Nonce: bigint;
  BaseFee?: bigint;
}

function decodeInteger(value : string, defaultValue: bigint): bigint
function decodeInteger(value : string) : bigint | undefined
function decodeInteger (value : string, defaultValue?: bigint): bigint | undefined {
  if (value === undefined || value === null || value.length === 0) return defaultValue;
  if (value === '0x') return BigInt(0);
  return BigInt(value);
}

function decodeNumber(value : string, defaultValue: number): number
function decodeNumber(value : string) : number | undefined
function decodeNumber (value : string, defaultValue?: number): number | undefined {
  if (value === undefined || value === null || value.length === 0) return defaultValue;
  if (value === '0x') return 0;
  return Number(value);
}

export function decodeHeader (rlp : Uint8Array): Header | undefined {
  try {
    const data = utils.RLP.decode(rlp);

    try {
      return {
        Parent: data[0],
        UnclesDigest: data[1],
        Beneficiary: data[2],
        StateRoot: data[4],
        TxRoot: data[4],
        RctRoot: data[5],
        Bloom: data[6],
        Difficulty: decodeInteger(data[7], BigInt(0)),
        Number: decodeInteger(data[8], BigInt(0)),
        GasLimit: decodeInteger(data[9], BigInt(0)),
        GasUsed: decodeInteger(data[10], BigInt(0)),
        Time: decodeNumber(data[11]) || 0,
        Extra: data[12],
        MixDigest: data[13],
        Nonce: decodeInteger(data[14], BigInt(0)),
        BaseFee: decodeInteger(data[15])
      };
    } catch (error: any) {
      log(error);
      return undefined;
    }
  } catch (error: any) {
    log(error);
    return undefined;
  }
}

export function encodeHeader (header: Header): string {
  return utils.RLP.encode([
    header.Parent,
    header.UnclesDigest,
    header.Beneficiary,
    header.StateRoot,
    header.TxRoot,
    header.RctRoot,
    header.Bloom,
    utils.hexlify(header.Difficulty),
    utils.hexlify(header.Number),
    utils.hexlify(header.GasLimit),
    utils.hexlify(header.GasUsed),
    utils.hexlify(header.Time),
    header.Extra,
    header.MixDigest,
    utils.hexlify(header.Nonce),
    ...(header.BaseFee ? [utils.hexlify(header.BaseFee)] : [])
  ]);
}

export function decodeData (hexLiteral: string): Uint8Array {
  return Uint8Array.from(Buffer.from(hexLiteral.slice(2), 'hex'));
}

// Method to escape hex string as stored in ipld-eth-db
// https://github.com/cerc-io/go-ethereum/blob/v1.11.6-statediff-5.0.8/statediff/indexer/database/file/sql_writer.go#L140
export function escapeHexString (hex: string): string {
  const value = hex.slice(2);
  return `\\x${value}`;
}

// https://docs.ethers.org/v5/cookbook/transactions/#cookbook--compute-raw-transaction
export function getRawTransaction (tx: TransactionResponse): string {
  function addKey (
    accum: {[key: string]: any},
    key: string
  ) {
    const txKey = key as keyof TransactionResponse;
    if (txKey in tx) { accum[key] = tx[txKey]; }
    return accum;
  }

  // Extract the relevant parts of the transaction and signature
  const txFields = 'accessList chainId data gasLimit maxFeePerGas maxPriorityFeePerGas nonce to type value'.split(' ');
  const sigFields = 'v r s'.split(' ');

  // Seriailze the signed transaction
  const raw = utils.serializeTransaction(txFields.reduce(addKey, {}) as UnsignedTransaction, sigFields.reduce(addKey, {}) as SignatureLike);

  // Double check things went well
  if (utils.keccak256(raw) !== tx.hash) { throw new Error('serializing failed!'); }

  return raw;
}
