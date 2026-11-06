const assert = require("node:assert/strict");
const { ethers } = require("hardhat");
const { SQB, SQK, DAY, PauseReason, CoreMode, increase, signPermit, revertsWith, close, eventArgs } = require("./helpers.cjs");

// Rounding: the stream rate truncates once per sync and each payout truncates per staker, so allow
// a few wei per operation.
const DUST = 10_000n;

async function deploy() {
  const [owner, alice, bob, carol, stranger] = await ethers.getSigners();
  const implementation = ethers.Wallet.createRandom().address;
  const core = await ethers.deployContract("MockSqueekCore", [implementation]);
  await core.setState(100, 5_000);
  const sqk = await ethers.deployContract("MockSqk");
  const sqb = await ethers.deployContract("SqbToken", ["Squeek Pet World Token", "SQB", owner.address]);
  const minter = await ethers.deployContract("SqbMinter", [core.target, sqk.target, sqb.target, owner.address]);
  await sqb.setInitialMinter(minter.target);
  for (const who of [alice, bob, carol]) {
    await sqk.mint(who.address, SQK(1_000_000));
    await sqk.connect(who).approve(minter.target, ethers.MaxUint256);
  }
  return { owner, alice, bob, carol, stranger, implementation, core, sqk, sqb, minter };
}

describe("SqbMinter", () => {
  it("starts from SqueekCore's current numbers and reads its round limit", async () => {
    const { core, minter, implementation } = await deploy();
    assert.equal(await minter.lastRound(), 100n);
    assert.equal(await minter.lastWork(), 5_000n);
    assert.equal(await minter.maxWorkPerRound(), 10_000n);
    assert.equal(await minter.acceptedImplementation(), implementation);
    assert.equal(await minter.pauseReason(), PauseReason.None);
    assert.equal(await minter.SQB_PER_WORK(), SQB("0.1"));
    assert.equal(await minter.core(), core.target);
  });

  it("pays 1 SQB per 10 settled work to stakers, streamed over 24 hours", async () => {
    const { core, sqb, minter, alice } = await deploy();
    await minter.connect(alice).stake(SQK(100));
    await core.settle(1, 2_000);
    const [synced] = await eventArgs(minter.sync(), minter, "Synced");
    assert.equal(synced.newWork, 2_000n);
    assert.equal(synced.scheduled, SQB(200));
    assert.equal(await minter.totalScheduled(), SQB(200));
    // Half way through the stream, about half has been earned.
    await increase(DAY / 2);
    close(await minter.earned(alice.address), SQB(100), SQB("0.01"), "half the stream");
    await increase(DAY);
    close(await minter.earned(alice.address), SQB(200), DUST, "the whole stream");
    await minter.connect(alice).claim();
    close(await sqb.balanceOf(alice.address), SQB(200), DUST);
    assert.equal(await sqb.totalSupply(), await minter.totalClaimed());
    assert.ok((await minter.totalClaimed()) <= (await minter.totalScheduled()));
  });

  it("never mints work settled while nobody was staked", async () => {
    const { core, sqb, minter, alice } = await deploy();
    await core.settle(3, 9_000);
    await minter.sync();
    assert.equal(await minter.workWithoutStakers(), 9_000n);
    assert.equal(await minter.totalScheduled(), 0n);
    assert.equal(await minter.lastWork(), 14_000n);
    // The first staker earns only from work settled after they staked.
    await minter.connect(alice).stake(SQK(1));
    await core.settle(1, 100);
    await minter.sync();
    await increase(2 * DAY);
    close(await minter.earned(alice.address), SQB(10), DUST);
    await minter.connect(alice).claim();
    close(await sqb.totalSupply(), SQB(10), DUST);
  });

  it("splits the stream by stake, and splitting a stake across wallets earns the same", async () => {
    const { core, minter, alice, bob, carol } = await deploy();
    await minter.connect(alice).stake(SQK(100));
    await minter.connect(bob).stake(SQK(150));
    await minter.connect(carol).stake(SQK(150));
    await core.settle(2, 4_000);
    await minter.sync();
    await increase(2 * DAY);
    const a = await minter.earned(alice.address);
    const b = await minter.earned(bob.address);
    const c = await minter.earned(carol.address);
    close(a, SQB(100), DUST);
    close(b + c, SQB(300), DUST, "two wallets of 150 earn what one wallet of 300 would");
  });

  it("gives a moment's large stake only a moment's share", async () => {
    const { core, minter, alice, bob } = await deploy();
    await minter.connect(alice).stake(SQK(100));
    await core.settle(1, 1_000);
    await minter.sync(); // 100 SQB over 24 hours
    await minter.connect(bob).stake(SQK(10_000));
    await increase(60);
    await minter.connect(bob).unstake(SQK(10_000));
    await increase(2 * DAY);
    const bobEarned = await minter.earned(bob.address);
    const aliceEarned = await minter.earned(alice.address);
    assert.ok(bobEarned < SQB("0.1"), `bob earned ${ethers.formatUnits(bobEarned)} SQB`);
    close(aliceEarned + bobEarned, SQB(100), DUST);
  });

  it("adds new work to what the stream still owes and restarts the 24 hours", async () => {
    const { core, minter, alice } = await deploy();
    await minter.connect(alice).stake(SQK(5));
    await core.settle(1, 2_400);
    await minter.sync(); // 240 SQB
    await increase(DAY / 4); // 60 paid, 180 left
    await core.settle(1, 1_200);
    await minter.sync(); // +120 -> about 300 over the next 24 hours (each block adds a second)
    const rate = await minter.rewardRate();
    close(rate * BigInt(DAY), SQB(300), SQB("0.01"));
    await increase(2 * DAY);
    close(await minter.earned(alice.address), SQB(360), DUST);
  });

  it("treats resting rounds as nothing to mint", async () => {
    const { core, minter, alice } = await deploy();
    await minter.connect(alice).stake(SQK(5));
    await core.settle(6, 0);
    const [synced] = await eventArgs(minter.sync(), minter, "Synced");
    assert.equal(synced.newWork, 0n);
    assert.equal(synced.scheduled, 0n);
    assert.equal(await minter.lastRound(), 106n);
    assert.equal(await minter.rewardRate(), 0n);
  });

  it("caps minting at maxWorkPerRound per settled round, and pauses beyond it", async () => {
    const { core, minter, alice } = await deploy();
    await minter.connect(alice).stake(SQK(5));
    await core.settle(2, 20_000); // exactly the cap for two rounds
    await minter.sync();
    assert.equal(await minter.totalScheduled(), SQB(2_000));
    await core.settle(1, 10_001);
    const [paused] = await eventArgs(minter.sync(), minter, "MintingPaused");
    assert.equal(paused.reason, PauseReason.TooMuchWork);
    assert.equal(await minter.totalScheduled(), SQB(2_000));
    assert.equal(await minter.lastWork(), 25_000n, "the anchor stays before the bad reading");
  });

  it("pauses when work arrives without a new settled round", async () => {
    const { core, minter, alice } = await deploy();
    await minter.connect(alice).stake(SQK(5));
    await core.setState(100, 5_001);
    await minter.sync();
    assert.equal(await minter.pauseReason(), PauseReason.TooMuchWork);
  });

  it("pauses when SqueekCore's numbers go backwards", async () => {
    const { core, minter, alice } = await deploy();
    await minter.connect(alice).stake(SQK(5));
    await core.setState(99, 6_000);
    await minter.sync();
    assert.equal(await minter.pauseReason(), PauseReason.Regressed);
    const second = await deploy();
    await second.minter.connect(second.alice).stake(SQK(5));
    await second.core.setState(101, 4_999);
    await second.minter.sync();
    assert.equal(await second.minter.pauseReason(), PauseReason.Regressed);
  });

  it("pauses when SqueekCore's implementation changes, and resumes past the gap", async () => {
    const { owner, core, minter, alice, stranger } = await deploy();
    await minter.connect(alice).stake(SQK(5));
    const upgraded = ethers.Wallet.createRandom().address;
    await core.setImplementation(upgraded);
    await core.settle(1, 1_000);
    await minter.sync();
    assert.equal(await minter.pauseReason(), PauseReason.ImplementationChanged);
    assert.equal(await minter.pendingWork(), 0n);
    // Paused: nothing is scheduled however much work settles.
    await core.settle(1, 1_000);
    assert.equal(await minter.sync.staticCall(), 0n);
    await revertsWith(minter.connect(stranger).resumeMinting(), minter, "OwnableUnauthorizedAccount");
    const [resumed] = await eventArgs(minter.connect(owner).resumeMinting(), minter, "MintingResumed");
    assert.equal(resumed.implementation, upgraded);
    assert.equal(resumed.cumulativeWork, 7_000n);
    assert.equal(await minter.acceptedImplementation(), upgraded);
    assert.equal(await minter.totalScheduled(), 0n, "the paused gap is never minted");
    await core.settle(1, 500);
    assert.equal(await minter.pendingWork(), 500n);
    await minter.sync();
    assert.equal(await minter.totalScheduled(), SQB(50));
  });

  it("pauses on replies in an unexpected format", async () => {
    for (const mode of [CoreMode.ShortReply, CoreMode.HugeReply, CoreMode.DirtyWord]) {
      const { core, minter, alice } = await deploy();
      await minter.connect(alice).stake(SQK(5));
      await core.setMode(mode);
      await minter.sync();
      assert.equal(await minter.pauseReason(), PauseReason.BadFormat, `mode ${mode}`);
    }
  });

  it("keeps staking, unstaking and claiming working when SqueekCore fails", async () => {
    for (const mode of [CoreMode.Revert, CoreMode.BurnGas]) {
      const { core, sqk, minter, alice } = await deploy();
      await minter.connect(alice).stake(SQK(5));
      await core.settle(1, 1_000);
      await minter.sync();
      await core.setMode(mode);
      assert.equal(await minter.sync.staticCall(), 0n);
      await minter.sync();
      assert.equal(await minter.pauseReason(), PauseReason.None, "a failed read is retried later, not a pause");
      await minter.connect(alice).stake(SQK(5));
      await increase(DAY);
      const tx = await minter.connect(alice).claim();
      const receipt = await tx.wait();
      assert.ok(receipt.gasUsed < 1_000_000n, `claim used ${receipt.gasUsed} gas`);
      await minter.connect(alice).unstake(SQK(10));
      assert.equal(await sqk.balanceOf(minter.target), 0n);
      close(await minter.totalClaimed(), SQB(100), DUST);
    }
  });

  it("still pays what was already streaming while minting is paused", async () => {
    const { owner, core, sqb, minter, alice } = await deploy();
    await minter.connect(alice).stake(SQK(5));
    await core.settle(1, 1_000);
    await minter.sync();
    await minter.connect(owner).pauseMinting();
    await core.settle(1, 1_000);
    await increase(2 * DAY);
    await minter.connect(alice).claim();
    close(await sqb.balanceOf(alice.address), SQB(100), DUST);
    await minter.connect(alice).unstake(SQK(5));
    // Staking still works while paused; it just earns nothing new.
    await minter.connect(alice).stake(SQK(1));
    assert.equal(await minter.pauseReason(), PauseReason.Owner);
  });

  it("lets only the owner pause and resume, once each", async () => {
    const { owner, minter, stranger } = await deploy();
    await revertsWith(minter.connect(stranger).pauseMinting(), minter, "OwnableUnauthorizedAccount");
    await revertsWith(minter.connect(owner).resumeMinting(), minter, "NotPaused");
    await minter.connect(owner).pauseMinting();
    await revertsWith(minter.connect(owner).pauseMinting(), minter, "AlreadyPaused");
    await minter.connect(owner).resumeMinting();
    assert.equal(await minter.mintingPaused(), false);
  });

  it("stakes with a permit signature instead of an approval, even if the permit was used first", async () => {
    const { sqk, minter } = await deploy();
    const player = ethers.Wallet.createRandom().connect(ethers.provider);
    const [funder] = await ethers.getSigners();
    await funder.sendTransaction({ to: player.address, value: ethers.parseEther("1") });
    await sqk.mint(player.address, SQK(50));
    const deadline = BigInt((await ethers.provider.getBlock("latest")).timestamp + 3600);
    const sig = await signPermit(sqk, player, minter.target, SQK(20), deadline);
    await minter.connect(player).stakeWithPermit(SQK(20), deadline, sig.v, sig.r, sig.s);
    assert.equal(await minter.stakedOf(player.address), SQK(20));
    // Someone copies the next permit from the mempool and submits it first: staking still works.
    const sig2 = await signPermit(sqk, player, minter.target, SQK(10), deadline);
    await sqk.permit(player.address, minter.target, SQK(10), deadline, sig2.v, sig2.r, sig2.s);
    await minter.connect(player).stakeWithPermit(SQK(10), deadline, sig2.v, sig2.r, sig2.s);
    assert.equal(await minter.stakedOf(player.address), SQK(30));
  });

  it("rejects empty and oversized amounts", async () => {
    const { minter, alice } = await deploy();
    await revertsWith(minter.connect(alice).stake(0), minter, "ZeroAmount");
    await revertsWith(minter.connect(alice).unstake(0), minter, "ZeroAmount");
    await minter.connect(alice).stake(SQK(3));
    await revertsWith(minter.connect(alice).unstake(SQK(4)), minter, "NotEnoughStaked");
  });

  it("never lets the owner take staked SQK", async () => {
    const { owner, sqk, minter, alice } = await deploy();
    await minter.connect(alice).stake(SQK(3));
    await revertsWith(minter.connect(owner).recoverToken(sqk.target, owner.address, SQK(3)), minter, "CannotRecoverStake");
    const other = await ethers.deployContract("MockSqk");
    await other.mint(minter.target, 7n);
    await minter.connect(owner).recoverToken(other.target, owner.address, 7n);
    assert.equal(await other.balanceOf(owner.address), 7n);
  });

  it("returns a player's whole position in one call", async () => {
    const { core, sqk, minter, alice } = await deploy();
    await minter.connect(alice).stake(SQK(4));
    await core.settle(1, 864);
    await minter.sync();
    await core.settle(2, 50);
    const info = await minter.account(alice.address);
    assert.equal(info.staked, SQK(4));
    assert.equal(info.totalStaked, SQK(4));
    assert.ok(info.ratePerSecond > 0n);
    assert.ok(info.streamEnds > 0n);
    assert.equal(info.claimable, await minter.earned(alice.address));
    assert.equal(info.pendingWork, 50n);
    assert.equal(info.pauseReason, 0n);
    assert.equal(info.lastWork, await minter.lastWork());
    assert.equal(info.totalScheduled, SQB("86.4"));
    assert.equal(info.sqkBalance, await sqk.balanceOf(alice.address));
    assert.equal(info.sqbBalance, 0n);
    const anyone = await minter.account(ethers.ZeroAddress);
    assert.equal(anyone.totalStaked, SQK(4));
    assert.equal(anyone.staked, 0n);
  });

  it("stops paying from this minter once SQB minting moves to another one", async () => {
    const { owner, core, sqk, sqb, minter, alice } = await deploy();
    await minter.connect(alice).stake(SQK(2));
    await core.settle(1, 100);
    await minter.sync();
    await increase(DAY);
    await sqb.connect(owner).proposeMinter(owner.address);
    await increase(2 * DAY);
    await sqb.connect(owner).acceptMinter();
    await revertsWith(minter.connect(alice).claim(), sqb, "NotMinter");
    await minter.connect(alice).unstake(SQK(2)); // the stake always comes back
    assert.equal(await sqk.balanceOf(minter.target), 0n);
  });

  it("keeps its books straight through a random mix of actions", async () => {
    const { core, sqk, sqb, minter, alice, bob, carol } = await deploy();
    const players = [alice, bob, carol];
    let seed = 12345;
    const rand = (n) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    for (let step = 0; step < 120; step++) {
      const who = players[rand(3)];
      const action = rand(6);
      if (action === 0) await minter.connect(who).stake(SQK(1 + rand(500)));
      else if (action === 1) {
        const staked = await minter.stakedOf(who.address);
        if (staked > 0n) await minter.connect(who).unstake(staked / BigInt(1 + rand(3)) || staked);
      } else if (action === 2) {
        const rounds = 1 + rand(16);
        await core.settle(rounds, rand(rounds * 10_000 + 1));
      } else if (action === 3) await increase(1 + rand(DAY));
      else if (action === 4) await minter.connect(who).claim();
      else await minter.sync();
    }
    await core.settle(1, 777);
    await minter.sync();
    await increase(2 * DAY);
    for (const who of players) await minter.connect(who).claim();
    const scheduled = await minter.totalScheduled();
    const claimed = await minter.totalClaimed();
    assert.equal(await sqb.totalSupply(), claimed);
    assert.ok(claimed <= scheduled, `claimed ${claimed} > scheduled ${scheduled}`);
    // What wasn't paid out went to moments with nobody staked, plus rounding.
    assert.equal(await sqk.balanceOf(minter.target), await minter.totalStaked());
    let staked = 0n;
    for (const who of players) staked += await minter.stakedOf(who.address);
    assert.equal(staked, await minter.totalStaked());
    assert.equal(await minter.pauseReason(), PauseReason.None);
  });
});
