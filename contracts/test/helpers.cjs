// Shared helpers for the contract specs.
const { ethers, network } = require("hardhat");

const SQB = (n) => ethers.parseUnits(String(n), 18);
const SQK = SQB;
const DAY = 24 * 60 * 60;
const WEEK = 7 * DAY;
// Season 1 of the game: Monday 2026-11-02 12:00 UTC.
const SEASON_ONE_START = 1793620800;
// The whitepaper's launch prices.
const PRICES = {
  deedBasePrice: SQK(10000),
  deedCap: 100n,
  renovateLevel2Price: SQB(500),
  renovateLevel3Price: SQB(1500),
  bannerPrice: SQK(50000),
  bannersPerSeason: 8n,
  decorationPrice: SQB(50),
};
const PauseReason = { None: 0n, Owner: 1n, ImplementationChanged: 2n, Regressed: 3n, TooMuchWork: 4n, BadFormat: 5n };
const CoreMode = { Normal: 0, Revert: 1, ShortReply: 2, HugeReply: 3, BurnGas: 4, DirtyWord: 5 };

async function now() {
  return Number((await ethers.provider.getBlock("latest")).timestamp);
}

async function increase(seconds) {
  await network.provider.send("evm_increaseTime", [seconds]);
  await network.provider.send("evm_mine");
}

async function setNextTime(timestamp) {
  await network.provider.send("evm_setNextBlockTimestamp", [timestamp]);
}

async function setTime(timestamp) {
  await network.provider.send("evm_setNextBlockTimestamp", [timestamp]);
  await network.provider.send("evm_mine");
}

/** Signs an EIP-2612 permit for `spender` from `owner` (an ethers signer). */
async function signPermit(token, owner, spender, value, deadline) {
  const [nonce, name, chainId] = await Promise.all([
    token.nonces(owner.address),
    token.name(),
    ethers.provider.getNetwork().then((n) => n.chainId),
  ]);
  const domain = await token.eip712Domain().then((d) => ({
    name: d.name ?? name,
    version: d.version,
    chainId,
    verifyingContract: d.verifyingContract,
  }));
  const types = {
    Permit: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };
  const signature = await owner.signTypedData(domain, types, { owner: owner.address, spender, value, nonce, deadline });
  return ethers.Signature.from(signature);
}

/** Asserts that `promise` reverts with the custom error `name` of `contract`. */
async function revertsWith(promise, contract, name) {
  try {
    await promise;
  } catch (error) {
    const data = error?.data ?? error?.error?.data ?? error?.info?.error?.data;
    const decoded = data ? contract.interface.parseError(data) : null;
    if (decoded?.name === name) return decoded;
    const text = String(error?.message ?? error);
    if (text.includes(`'${name}(`) || text.includes(`custom error '${name}`) || text.includes(` ${name}(`)) return null;
    throw new Error(`expected ${name}, got: ${decoded?.name ?? text.slice(0, 300)}`);
  }
  throw new Error(`expected ${name}, but it did not revert`);
}

async function reverts(promise, fragment) {
  try {
    await promise;
  } catch (error) {
    if (fragment && !String(error?.message ?? error).includes(fragment)) {
      throw new Error(`expected a revert containing ${fragment}, got: ${String(error?.message ?? error).slice(0, 300)}`);
    }
    return;
  }
  throw new Error("expected a revert, but it did not revert");
}

/** |a - b| <= tolerance, for bigints. */
function close(a, b, tolerance, message) {
  const diff = a > b ? a - b : b - a;
  if (diff > tolerance) throw new Error(`${message ?? "values differ"}: ${a} vs ${b} (diff ${diff} > ${tolerance})`);
}

async function eventArgs(tx, contract, name) {
  const receipt = await (await tx).wait();
  return receipt.logs
    .map((log) => {
      try {
        return contract.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .filter((e) => e && e.name === name)
    .map((e) => e.args);
}

module.exports = { SQB, SQK, DAY, WEEK, SEASON_ONE_START, PRICES, PauseReason, CoreMode, now, increase, setNextTime, setTime, signPermit, revertsWith, reverts, close, eventArgs };
