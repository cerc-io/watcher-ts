//
// Copyright 2021 Vulcanize, Inc.
//

import { describe, it } from 'mocha';
import { expect } from 'chai';

import { addressesInTrace } from './util';

describe('addressInTrace', () => {
  it('should parse an empty trace', () => {
    const addresses = addressesInTrace({});
    expect(addresses).to.eql([]);
  });

  it('should parse an unnested trace', () => {
    const addresses = addressesInTrace({
      from: '0xDC7d7A8920C8Eecc098da5B7522a5F31509b5Bfc',
      to: '0xCA6D29232D1435D8198E3E5302495417dD073d61'
    });

    expect(addresses).to.eql([
      '0xCA6D29232D1435D8198E3E5302495417dD073d61',
      '0xDC7d7A8920C8Eecc098da5B7522a5F31509b5Bfc'
    ]);
  });

  it('should parse an unnested trace with an addresses field', () => {
    const addresses = addressesInTrace({
      from: '0xDC7d7A8920C8Eecc098da5B7522a5F31509b5Bfc',
      to: '0xCA6D29232D1435D8198E3E5302495417dD073d61',
      addresses: {
        '0x9273D9437B0bf2F1b7999d8dB72960d6379564d1': {},
        '0xd86fB467B78901310e9967A2C8B601A5E794c12C': {}
      }
    });

    expect(addresses).to.eql([
      '0x9273D9437B0bf2F1b7999d8dB72960d6379564d1',
      '0xCA6D29232D1435D8198E3E5302495417dD073d61',
      '0xDC7d7A8920C8Eecc098da5B7522a5F31509b5Bfc',
      '0xd86fB467B78901310e9967A2C8B601A5E794c12C'
    ]);
  });

  it('should parse a nested trace', () => {
    const addresses = addressesInTrace({
      from: '0xDC7d7A8920C8Eecc098da5B7522a5F31509b5Bfc',
      to: '0xCA6D29232D1435D8198E3E5302495417dD073d61',
      calls: [{
        from: '0x9273D9437B0bf2F1b7999d8dB72960d6379564d1',
        to: '0xd86fB467B78901310e9967A2C8B601A5E794c12C'
      },
      {
        from: '0xf29340ca4ad7A797dF2d67Be58d354EC284AE62f',
        to: '0xEcFF6b14D3ed9569108b413f846279E64E39BC92'
      }]
    });

    expect(addresses).to.eql([
      '0x9273D9437B0bf2F1b7999d8dB72960d6379564d1',
      '0xCA6D29232D1435D8198E3E5302495417dD073d61',
      '0xDC7d7A8920C8Eecc098da5B7522a5F31509b5Bfc',
      '0xEcFF6b14D3ed9569108b413f846279E64E39BC92',
      '0xd86fB467B78901310e9967A2C8B601A5E794c12C',
      '0xf29340ca4ad7A797dF2d67Be58d354EC284AE62f'
    ]);
  });

  it('should parse a nested trace with an addresses field', () => {
    const addresses = addressesInTrace({
      from: '0xDC7d7A8920C8Eecc098da5B7522a5F31509b5Bfc',
      to: '0xCA6D29232D1435D8198E3E5302495417dD073d61',
      calls: [{
        from: '0x9273D9437B0bf2F1b7999d8dB72960d6379564d1',
        to: '0xd86fB467B78901310e9967A2C8B601A5E794c12C',
        addresses: {
          '0xf29340ca4ad7A797dF2d67Be58d354EC284AE62f': {},
          '0xEcFF6b14D3ed9569108b413f846279E64E39BC92': {}
        }
      }]
    });

    expect(addresses).to.eql([
      '0x9273D9437B0bf2F1b7999d8dB72960d6379564d1',
      '0xCA6D29232D1435D8198E3E5302495417dD073d61',
      '0xDC7d7A8920C8Eecc098da5B7522a5F31509b5Bfc',
      '0xEcFF6b14D3ed9569108b413f846279E64E39BC92',
      '0xd86fB467B78901310e9967A2C8B601A5E794c12C',
      '0xf29340ca4ad7A797dF2d67Be58d354EC284AE62f'
    ]);
  });

  it('should not return duplicate addresses', () => {
    const addresses = addressesInTrace({
      from: '0xDC7d7A8920C8Eecc098da5B7522a5F31509b5Bfc',
      to: '0xCA6D29232D1435D8198E3E5302495417dD073d61',
      calls: [{
        from: '0xDC7d7A8920C8Eecc098da5B7522a5F31509b5Bfc',
        to: '0xCA6D29232D1435D8198E3E5302495417dD073d61',
        addresses: {
          '0xDC7d7A8920C8Eecc098da5B7522a5F31509b5Bfc': {},
          '0xCA6D29232D1435D8198E3E5302495417dD073d61': {}
        }
      }]
    });

    expect(addresses).to.eql([
      '0xCA6D29232D1435D8198E3E5302495417dD073d61',
      '0xDC7d7A8920C8Eecc098da5B7522a5F31509b5Bfc'
    ]);
  });

  it('should return correct addresses for an ERC20 transfer', () => {
    /* eslint-disable */
    const trace = {
      "type": "CALL",
      "from": "0xdc7d7a8920c8eecc098da5b7522a5f31509b5bfc",
      "to": "0x1ca7c995f8ef0a2989bbce08d5b7efe50a584aa1",
      "value": "0x0",
      "gas": "0x4edf",
      "gasUsed": "0x3982",
      "input": "0xa9059cbb000000000000000000000000ca6d29232d1435d8198e3e5302495417dd073d610000000000000000000000000000000000000000000000000de0b6b3a7640000",
      "output": "0x0000000000000000000000000000000000000000000000000000000000000001",
      "time": "66.609994ms",
      "addresses": {
        "0xca6d29232d1435d8198e3e5302495417dd073d61": {
          "confidence": 1,
          "opcodes": [
            "CALLDATALOAD", "AND", "SWAP1", "DUP5", "DUP3", "AND", "DUP4", "POP", "DUP6", "AND", "AND", "DUP5", "AND", "AND", "DUP2", "AND", "POP", "SWAP2"
          ]
        },
        "0xdc7d7a8920c8eecc098da5b7522a5f31509b5bfc": {
          "confidence": 1,
          "opcodes": [
            "CALLER", "POP", "JUMP", "JUMPDEST", "DUP4", "AND", "DUP4", "POP", "DUP8", "AND", "AND", "DUP6", "AND", "AND", "DUP4", "AND", "POP"
          ]
        }
      }
    };
    /* eslint-enable */

    const addresses = addressesInTrace(trace);
    expect(addresses).to.eql([
      '0x1ca7c995f8eF0A2989BbcE08D5B7Efe50A584aa1',
      '0xCA6D29232D1435D8198E3E5302495417dD073d61',
      '0xDC7d7A8920C8Eecc098da5B7522a5F31509b5Bfc'
    ]);
  });
});
