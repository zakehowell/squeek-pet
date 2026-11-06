// Hardhat compiles the Solidity in src/ and runs the mocha specs in test/.
// SQUEEK_FORK=1 forks Sepolia through a public RPC so test/fork.spec.cjs can
// check the contracts against the real SqueekCore and SQK. Nothing here deploys
// or holds a key: deploying is done by the project owner with their own wallet
// (see deploy/).
require("@nomicfoundation/hardhat-ethers");

// The RPC must serve historical state. Tenderly's public gateway does; publicnode's load
// balancer sometimes lands on a pruned node ("historical state ... is not available").
const FORK_URL = process.env.SQUEEK_FORK_URL || "https://sepolia.gateway.tenderly.co";
// The block just before a real settlement that carried work (round 356 -> 357, work 10,603 ->
// 11,030, 2026-11-06), so the fork spec can replay it.
const FORK_BLOCK = Number(process.env.SQUEEK_FORK_BLOCK || 12075053);
const forking = process.env.SQUEEK_FORK ? { url: FORK_URL, blockNumber: FORK_BLOCK } : undefined;

module.exports = {
  solidity: {
    version: "0.8.28",
    settings: { optimizer: { enabled: true, runs: 500 }, evmVersion: "cancun" },
  },
  paths: { sources: "src", tests: "test", cache: "cache", artifacts: "artifacts" },
  networks: {
    hardhat: forking ? { chainId: 11155111, forking } : { chainId: 31337 },
  },
  mocha: { timeout: 120000 },
};
