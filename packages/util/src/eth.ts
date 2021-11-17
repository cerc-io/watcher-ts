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

function decodeHex (hex: string): any {
  return Buffer.from(hex.slice(2), 'hex');
}

export function decodeHeader (rlp : Uint8Array): any {
  try {
    const data = utils.RLP.decode(rlp);

    try {
      return {
        Parent: decodeHex(data[0]),
        UnclesDigest: decodeHex(data[1]),
        Beneficiary: decodeHex(data[2]),
        StateRoot: decodeHex(data[4]),
        TxRoot: decodeHex(data[4]),
        RctRoot: decodeHex(data[5]),
        Bloom: decodeHex(data[6]),
        Difficulty: decodeInteger(data[7], BigInt(0)),
        Number: decodeInteger(data[8], BigInt(0)),
        GasLimit: decodeInteger(data[9], BigInt(0)),
        GasUsed: decodeInteger(data[10], BigInt(0)),
        Time: decodeNumber(data[11]) || 0,
        Extra: decodeHex(data[12]),
        MixDigest: decodeHex(data[13]),
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
