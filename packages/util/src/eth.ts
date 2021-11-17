import debug from 'debug';
import assert from 'assert';
import { CID, digest } from 'multiformats';
import { code as JSON_CODEC } from 'multiformats/codecs/json';
import { base64url } from 'multiformats/bases/base64';
import { utils } from 'ethers';

const log = debug('vulcanize:eth');

export enum HashCode {
  KEC_RLP_JSON = 471,
  KEC_RLP_JSON_ACCOUNT,
  KEC_RLP_JSON_TRANSACTION,
  KEC_RLP_JSON_BLOCK_HEADER,
  KEC_RLP_JSON_LOG_ENTRY,
  KEC_RLP_JSON_RECEIPT,
  KEC_RLP_JSON_RECEIPTS,
  KEC_RLP_JSON_TRANSACTIONS,
  KEC_RLP_JSON_STORAGE,
}

export function toBytes (bytes: Uint8Array): any {
  return { '/': { bytes: base64url.encode(bytes) } };
}

export function toCID (code: HashCode, hash: Uint8Array) : CID {
  try {
    return CID.create(1, JSON_CODEC, digest.create(code, hash));
  } catch (err: any) {
    console.error('error creating CID from:', { code, hash: Buffer.from(hash).toString('hex') });
    throw err;
  }
}

export function isHashCode (thing: any) : thing is HashCode {
  return typeof thing === 'number' && HashCode[thing] !== undefined;
}

export function toLink (code: HashCode, hash: Uint8Array): any {
  assert(isHashCode(code));
  return { '/': toCID(code, hash).toString(base64url) };
}

export interface Header {
  ParentCID: any,
  UnclesDigest: any,
  StateRootCID: any,
  Beneficiary: any,
  TxRootCID: any,
  RctRootCID: any,
  Bloom: any,
  Difficulty: BigInt,
  Number: BigInt,
  GasLimit: BigInt,
  GasUsed: BigInt,
  Time: number,
  Extra: any,
  MixDigest: any,
  Nonce: BigInt,
  BaseFee?: BigInt
}

export function decodeInteger(value : string, defaultValue: BigInt) : BigInt
export function decodeInteger(value : string) : BigInt | undefined
export function decodeInteger (value : string, defaultValue?: BigInt) : BigInt | undefined {
  if (value === undefined || value === null || value.length === 0) return defaultValue;
  if (value === '0x') return BigInt(0);
  return BigInt(value);
}

export function decodeNumber(value : string, defaultValue: number) : number
export function decodeNumber(value : string) : number | undefined
export function decodeNumber (value : string, defaultValue?: number) : number | undefined {
  if (value === undefined || value === null || value.length === 0) return defaultValue;
  if (value === '0x') return 0;
  return Number(value);
}

export function decodeBytes (hex: string): any {
  if (hex === undefined || hex === null || hex.length < 2) return { '/': { bytes: '' } };
  return toBytes(Buffer.from(hex.slice(2), 'hex'));
}

export function decodeHash (code : HashCode, hex: string): any {
  return toLink(code, Buffer.from(hex.slice(2), 'hex'));
}

export function decodeHeader (rlp : Uint8Array) : Header | undefined {
  try {
    const data = utils.RLP.decode(rlp);

    try {
      return {
        ParentCID: decodeHash(HashCode.KEC_RLP_JSON_BLOCK_HEADER, data[0]),
        UnclesDigest: decodeBytes(data[1]),
        Beneficiary: decodeBytes(data[2]),
        StateRootCID: decodeHash(HashCode.KEC_RLP_JSON_STORAGE, data[4]),
        TxRootCID: decodeHash(HashCode.KEC_RLP_JSON_TRANSACTIONS, data[4]),
        RctRootCID: decodeHash(HashCode.KEC_RLP_JSON_RECEIPTS, data[5]),
        Bloom: decodeBytes(data[6]),
        Difficulty: decodeInteger(data[7], BigInt(0)),
        Number: decodeInteger(data[8], BigInt(0)),
        GasLimit: decodeInteger(data[9], BigInt(0)),
        GasUsed: decodeInteger(data[10], BigInt(0)),
        Time: decodeNumber(data[11]) || 0,
        Extra: decodeBytes(data[12]),
        MixDigest: decodeBytes(data[13]),
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

export function decodeData (hexLiteral: string) : Uint8Array {
  return Uint8Array.from(Buffer.from(hexLiteral.slice(2), 'hex'));
}
