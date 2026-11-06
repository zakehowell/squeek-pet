// Deploys Squeek Pet World on a local Hardhat fork of Sepolia, for development only:
//
//   npm run node:fork          (in one terminal: a local node forking Sepolia)
//   npm run local:deploy       (in another: deploys here and writes deploy/local.json)
//
// then open the World's dev page with ?chain=local (npm run dev in the repository root,
// http://127.0.0.1:1420/world.html?chain=local) and connect a wallet to http://127.0.0.1:8545
// with chain id 11155111, using one of Hardhat's well-known test accounts. The faucet is filled
// from the official SqueekStaking contract, which only a local fork can impersonate. Nothing
// here touches the real Sepolia; the real deployment is the deploy page in deploy/ (npm run deploy:page).
const { writeFileSync } = require("node:fs");
const path = require("node:path");
const { ethers, network } = require("hardhat");

const CORE = "0xfd6c166d4b8e2962e65746a13e5a0797cd4de0c4";
const SQK = "0xd78a3956cf63164d1fa1c622ad3c66623162fa1e";
const STAKING = "0x50fd1780526c3186a0c037c7622203bc4fb611ca";
const SEASON_ONE_START = 1793620800; // Monday 2026-11-02 12:00 UTC
const units = (n) => ethers.parseUnits(String(n), 18);
const PRICES = {
  deedBasePrice: units(10000),
  deedCap: 100n,
  renovateLevel2Price: units(500),
  renovateLevel3Price: units(1500),
  bannerPrice: units(50000),
  bannersPerSeason: 8n,
  decorationPrice: units(50),
};

async function main() {
  const { chainId } = await ethers.provider.getNetwork();
  if (chainId !== 11155111n || !(await ethers.provider.getCode(CORE)).slice(2)) {
    throw new Error("Run this against a local fork of Sepolia: npm run node:fork, then npm run local:deploy");
  }
  const [owner] = await ethers.getSigners();
  const sqb = await ethers.deployContract("SqbToken", ["Squeek Pet World Token", "SQB", owner.address]);
  const minter = await ethers.deployContract("SqbMinter", [CORE, SQK, sqb.target, owner.address]);
  await (await sqb.setInitialMinter(minter.target)).wait();
  const shop = await ethers.deployContract("WorldShop", [SQK, sqb.target, SEASON_ONE_START, PRICES]);
  const faucet = await ethers.deployContract("SqkFaucet", [SQK, units(1000), 24 * 3600, units(1000), owner.address]);

  await network.provider.send("hardhat_impersonateAccount", [STAKING]);
  await network.provider.send("hardhat_setBalance", [STAKING, "0x56BC75E2D63100000"]);
  const sqk = new ethers.Contract(SQK, ["function transfer(address,uint256) returns (bool)"], await ethers.getSigner(STAKING));
  await (await sqk.transfer(faucet.target, units(100_000))).wait();

  const config = {
    chainId: 11155111,
    rpcUrl: process.env.LOCAL_RPC_URL || "http://127.0.0.1:8545",
    explorer: "https://sepolia.etherscan.io",
    core: CORE,
    sqk: SQK,
    sqb: sqb.target,
    minter: minter.target,
    shop: shop.target,
    faucet: faucet.target,
  };
  const out = path.join(__dirname, "..", "deploy", "local.json");
  writeFileSync(out, `${JSON.stringify(config, null, 2)}\n`);
  console.log(JSON.stringify(config, null, 2));
  console.log(`Wrote ${path.relative(process.cwd(), out)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
