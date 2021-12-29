import debug from 'debug';
import { utils } from 'ethers';

const log = debug('vulcanize:eth');

function decodeInteger(value : string, defaultValue: BigInt): BigInt
function decodeInteger(value : string) : BigInt | undefined
function decodeInteger (value : string, defaultValue?: BigInt): BigInt | undefined {
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

export function decodeHeader (rlp : Uint8Array): any {
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

export function decodeData (hexLiteral: string): Uint8Array {
  return Uint8Array.from(Buffer.from(hexLiteral.slice(2), 'hex'));
}

export function decodeTransaction (rlp : Uint8Array): any {
  try {
    const data = utils.RLP.decode(rlp);

    return {
      GasPrice: decodeInteger(data[1], BigInt(0)),
      GasLimit: decodeInteger(data[2], BigInt(0)),
      Amount: decodeInteger(data[4], BigInt(0)),
      Data: data[5]
    };
  } catch (error: any) {
    log(error);
    return undefined;
  }
}
