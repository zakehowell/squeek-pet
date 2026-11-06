// Runs only with SQUEEK_FORK=1 (npm run test:fork): a Sepolia fork at the block before a real
// settlement that carried work. It checks the contracts against the real SqueekCore and SQK:
// SqueekCore's state() and configuration() layouts, SQK's permit and burn, and the whole minting
// path by replaying that real settlement transaction.
const assert = require("node:assert/strict");
const { ethers, network } = require("hardhat");
const { SQB, SQK, DAY, PRICES, PauseReason, increase, signPermit, close, eventArgs } = require("./helpers.cjs");

const CORE = "0xfd6c166d4b8e2962e65746a13e5a0797cd4de0c4";
const SQK_TOKEN = "0xd78a3956cf63164d1fa1c622ad3c66623162fa1e";
const STAKING = "0x50fd1780526c3186a0c037c7622203bc4fb611ca"; // official SqueekStaking holds SQK
// The real settlement after the fork block: round 356 -> 357, cumulative work 10,603 -> 11,030.
const REPLAY_TX = "0xaafaf47f8f929338c2d93287591ebb2a4fec4ce15ecfde73853e6f2484bfff6b";

const coreAbi = [
  "function state() view returns ((uint64 settledThroughRound,uint64 cumulativeWork,uint96 cumulativeBlockUnits,uint64 blockHeight,uint96 blockProgress,uint32 workPerThousandBlocks,uint256 authorizationNonce,bool paused))",
  "function implementationCodeAddress() view returns (address)",
];
const sqkAbi = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address,uint256) returns (bool)",
  "function totalSupply() view returns (uint256)",
  "function totalBurned() view returns (uint256)",
  "function nonces(address) view returns (uint256)",
  "function name() view returns (string)",
  "function eip712Domain() view returns (bytes1,string name,string version,uint256 chainId,address verifyingContract,bytes32,uint256[])",
];

async function impersonate(address) {
  await network.provider.send("hardhat_impersonateAccount", [address]);
  await network.provider.send("hardhat_setBalance", [address, "0x56BC75E2D63100000"]);
  return ethers.getSigner(address);
}

(process.env.SQUEEK_FORK ? describe : describe.skip)("Sepolia fork: the real SqueekCore and SQK", function () {
  let core, sqk, player, owner;

  before(async function () {
    assert.equal((await ethers.provider.getNetwork()).chainId, 11155111n);
    [owner] = await ethers.getSigners();
    core = new ethers.Contract(CORE, coreAbi, ethers.provider);
    sqk = new ethers.Contract(SQK_TOKEN, sqkAbi, ethers.provider);
    player = ethers.Wallet.createRandom().connect(ethers.provider);
    await owner.sendTransaction({ to: player.address, value: ethers.parseEther("2") });
    const staking = await impersonate(STAKING);
    await sqk.connect(staking).transfer(player.address, SQK(30_000));
  });

  it("anchors at SqueekCore's real numbers and reads its real round limit", async () => {
    const sqb = await ethers.deployContract("SqbToken", ["Squeek Pet World Token", "SQB", owner.address]);
    const minter = await ethers.deployContract("SqbMinter", [CORE, SQK_TOKEN, sqb.target, owner.address]);
    const s = await core.state();
    assert.equal(await minter.lastRound(), s.settledThroughRound);
    assert.equal(await minter.lastWork(), s.cumulativeWork);
    assert.equal(s.settledThroughRound, 356n);
    assert.equal(s.cumulativeWork, 10_603n);
    assert.equal(await minter.maxWorkPerRound(), 10_000n);
    assert.equal(await minter.acceptedImplementation(), await core.implementationCodeAddress());
    assert.equal(await minter.pendingWork(), 0n);
  });

  it("mints SQB for a real settlement, replayed from its original transaction", async () => {
    const sqb = await ethers.deployContract("SqbToken", ["Squeek Pet World Token", "SQB", owner.address]);
    const minter = await ethers.deployContract("SqbMinter", [CORE, SQK_TOKEN, sqb.target, owner.address]);
    await sqb.setInitialMinter(minter.target);

    // Stake real SQK with a real SQK permit signature.
    const deadline = BigInt((await ethers.provider.getBlock("latest")).timestamp + 3600);
    const sig = await signPermit(sqk, player, minter.target, SQK(1_000), deadline);
    await minter.connect(player).stakeWithPermit(SQK(1_000), deadline, sig.v, sig.r, sig.s);
    assert.equal(await minter.totalStaked(), SQK(1_000));

    // Replay the real settlement exactly as its relayer sent it.
    const original = await ethers.provider.getTransaction(REPLAY_TX);
    const relayer = await impersonate(original.from);
    const replay = await relayer.sendTransaction({ to: original.to, data: original.data, gasLimit: original.gasLimit });
    await replay.wait();
    const after = await core.state();
    assert.equal(after.settledThroughRound, 357n);
    assert.equal(after.cumulativeWork, 11_030n);

    assert.equal(await minter.pendingWork(), 427n);
    const [synced] = await eventArgs(minter.sync(), minter, "Synced");
    assert.equal(synced.newWork, 427n);
    assert.equal(synced.scheduled, SQB("42.7"));
    assert.equal(await minter.pauseReason(), PauseReason.None);

    await increase(2 * DAY);
    await minter.connect(player).claim();
    close(await sqb.balanceOf(player.address), SQB("42.7"), 10_000n);
    await minter.connect(player).unstake(SQK(1_000));
    assert.equal(await sqk.balanceOf(minter.target), 0n);
  });

  it("burns real SQK for a deed with a real permit", async () => {
    const sqb = await ethers.deployContract("SqbToken", ["Squeek Pet World Token", "SQB", owner.address]);
    const shop = await ethers.deployContract("WorldShop", [SQK_TOKEN, sqb.target, 1793620800, PRICES]);
    const burnedBefore = await sqk.totalBurned();
    const supplyBefore = await sqk.totalSupply();
    const deadline = BigInt((await ethers.provider.getBlock("latest")).timestamp + 3600);
    const sig = await signPermit(sqk, player, shop.target, SQK(10_000), deadline);
    await shop.connect(player).buyDeedWithPermit(SQK(10_000), deadline, sig.v, sig.r, sig.s);
    assert.equal(await shop.ownerOf(1), player.address);
    assert.equal(await sqk.totalBurned(), burnedBefore + SQK(10_000));
    assert.equal(await sqk.totalSupply(), supplyBefore - SQK(10_000));
    assert.equal(await sqk.balanceOf(shop.target), 0n);
  });
});
