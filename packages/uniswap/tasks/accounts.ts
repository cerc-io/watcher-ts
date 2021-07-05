import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { task } from "hardhat/config";

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (args, hre) => {
  const accounts: SignerWithAddress[] = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});
