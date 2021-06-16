import { ethers } from 'ethers';

export const getTxTrace = async (providerUrl: string, txHash: string, tracer: string | undefined, timeout: string | undefined): Promise<any> => {
  const provider = new ethers.providers.JsonRpcProvider(providerUrl);
  return provider.send('debug_traceTransaction', [txHash, { tracer, timeout }]);
};

export const getCallTrace = async (providerUrl: string, block: string, txData: any, tracer: string | undefined): Promise<any> => {
  const provider = new ethers.providers.JsonRpcProvider(providerUrl);
  return provider.send('debug_traceCall', [ txData, block, { tracer }]);
};
