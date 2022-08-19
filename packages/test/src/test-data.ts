//
// Copyright 2022 Vulcanize, Inc.
//

import { readAbi } from "./common";

// UniswapV2 Factory contract
export const uniswapV2FactoryAddress = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
export const uniswapV2FactoryABI = readAbi("abis/UniswapV2Factory.json");

// UniswapV2 Pair contract
export const uniswapV2PairAddress = "0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc";
export const uniswapV2PairABI = readAbi("abis/UniswapV2Pair.json");

// USDC contract
export const usdcAddress = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
export const usdcABI = readAbi("abis/FiatTokenV2_1.json");

// Compound contract
export const compoundAddress = "0xc00e94Cb662C3520282E6f5717214004A7f26888";
export const compoundABI = readAbi("abis/Comp.json");

// Dai/Maker contract
export const daiAddress = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
export const daiABI = readAbi("abis/Dai.json");
