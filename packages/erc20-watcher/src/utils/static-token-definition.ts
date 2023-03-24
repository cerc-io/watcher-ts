//
// Copyright 2021 Vulcanize, Inc.
//

import { utils } from 'ethers';

// Initialize a Token Definition with the attributes.
export class StaticTokenDefinition {
  address : string;
  symbol: string;
  name: string;
  decimals: bigint;

  // Initialize a Token Definition with its attributes.
  constructor (address: string, symbol: string, name: string, decimals: bigint) {
    this.address = address;
    this.symbol = symbol;
    this.name = name;
    this.decimals = decimals;
  }

  // Get all tokens with a static defintion
  static getStaticDefinitions (): Array<StaticTokenDefinition> {
    const staticDefinitions = [];

    // Add DGD.
    const tokenDGD = new StaticTokenDefinition(
      utils.getAddress('0xe0b7927c4af23765cb51314a0e0521a9645f0e2a'),
      'DGD',
      'DGD',
      BigInt(9)
    );
    staticDefinitions.push(tokenDGD);

    // Add AAVE.
    const tokenAAVE = new StaticTokenDefinition(
      utils.getAddress('0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9'),
      'AAVE',
      'Aave Token',
      BigInt(18)
    );
    staticDefinitions.push(tokenAAVE);

    // Add LIF.
    const tokenLIF = new StaticTokenDefinition(
      utils.getAddress('0xeb9951021698b42e4399f9cbb6267aa35f82d59d'),
      'LIF',
      'Lif',
      BigInt(18)
    );
    staticDefinitions.push(tokenLIF);

    // Add SVD.
    const tokenSVD = new StaticTokenDefinition(
      utils.getAddress('0xbdeb4b83251fb146687fa19d1c660f99411eefe3'),
      'SVD',
      'savedroid',
      BigInt(18)
    );
    staticDefinitions.push(tokenSVD);

    // Add TheDAO.
    const tokenTheDAO = new StaticTokenDefinition(
      utils.getAddress('0xbb9bc244d798123fde783fcc1c72d3bb8c189413'),
      'TheDAO',
      'TheDAO',
      BigInt(16)
    );
    staticDefinitions.push(tokenTheDAO);

    // Add HPB.
    const tokenHPB = new StaticTokenDefinition(
      utils.getAddress('0x38c6a68304cdefb9bec48bbfaaba5c5b47818bb2'),
      'HPB',
      'HPBCoin',
      BigInt(18)
    );
    staticDefinitions.push(tokenHPB);

    return staticDefinitions;
  }

  // Helper for hardcoded tokens.
  static fromAddress (tokenAddress: string) : StaticTokenDefinition | null {
    const staticDefinitions = this.getStaticDefinitions();
    const tokenAddressHex = utils.hexlify(tokenAddress);

    // Search the definition using the address.
    for (let i = 0; i < staticDefinitions.length; i++) {
      const staticDefinition = staticDefinitions[i];
      if (utils.getAddress(utils.hexlify(staticDefinition.address)) === utils.getAddress(tokenAddressHex)) {
        return staticDefinition;
      }
    }

    // If not found, return null.
    return null;
  }
}
