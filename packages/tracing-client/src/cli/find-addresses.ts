import fs from 'fs';
import yargs from 'yargs';
import { ethers } from 'ethers';

interface StructLog {
  stack: string[]
}

(async () => {
  const argv = await yargs.parserConfiguration({
    'parse-numbers': false
  }).options({
    traceFile: {
      type: 'string',
      require: true,
      demandOption: true
    }
  }).argv;

  const { structLogs }: { structLogs: StructLog[] } = JSON.parse(fs.readFileSync(argv.traceFile).toString("utf-8"));

  const addressMap: any = {};

  structLogs.forEach((log: StructLog) => {
    if (!log.stack.length) {
      return;
    }

    let maybeAddress = log.stack[log.stack.length - 1];

    // Address are 40 bytes.
    // Example: 000000000000000000000000ca6d29232d1435d8198e3e5302495417dd073d61
    if (!maybeAddress.startsWith("000000000000000000000000")) {
      return;
    }

    if (addressMap[maybeAddress]) {
      return;
    }

    maybeAddress = maybeAddress.substr("000000000000000000000000".length);

    if (!ethers.utils.isAddress(maybeAddress)) {
      return;
    }

    addressMap[ethers.utils.getAddress(maybeAddress)] = true;
    Object.keys(addressMap).forEach(address => {
      console.log(address);
    });
  });
})();
