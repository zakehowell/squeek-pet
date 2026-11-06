const assert = require("node:assert/strict");
const { ethers } = require("hardhat");
const { SQK, DAY, increase, revertsWith } = require("./helpers.cjs");

async function deploy() {
  const [owner, alice, bob, stranger] = await ethers.getSigners();
  const sqk = await ethers.deployContract("MockSqk");
  const faucet = await ethers.deployContract("SqkFaucet", [sqk.target, SQK(500), DAY, SQK(100), owner.address]);
  await sqk.mint(faucet.target, SQK(1_200));
  return { owner, alice, bob, stranger, sqk, faucet };
}

describe("SqkFaucet", () => {
  it("gives a new player some SQK once a day", async () => {
    const { sqk, faucet, alice } = await deploy();
    await faucet.connect(alice).drip();
    assert.equal(await sqk.balanceOf(alice.address), SQK(500));
    // Spending it down doesn't skip the wait.
    await sqk.connect(alice).transfer(ethers.ZeroAddress.replace(/0$/, "1"), SQK(500));
    await revertsWith(faucet.connect(alice).drip(), faucet, "TooSoon");
    await increase(DAY);
    await faucet.connect(alice).drip();
    assert.equal(await sqk.balanceOf(alice.address), SQK(500));
  });

  it("skips players who already hold SQK, and says when it is empty", async () => {
    const { sqk, faucet, alice, bob, stranger } = await deploy();
    await sqk.mint(bob.address, SQK(100));
    await revertsWith(faucet.connect(bob).drip(), faucet, "AlreadyHasSqk");
    await faucet.connect(alice).drip();
    await faucet.connect(stranger).drip();
    const fresh = (await ethers.getSigners())[5];
    await revertsWith(faucet.connect(fresh).drip(), faucet, "FaucetEmpty");
  });

  it("tells the game what a player can take and when", async () => {
    const { sqk, faucet, alice } = await deploy();
    let s = await faucet.status(alice.address);
    assert.deepEqual([...s], [SQK(500), BigInt(DAY), SQK(100), SQK(1_200), 0n, 0n]);
    await faucet.connect(alice).drip();
    s = await faucet.status(alice.address);
    assert.equal(s.left, SQK(700));
    assert.equal(s.nextAt, (await faucet.lastDripAt(alice.address)) + BigInt(DAY));
    assert.equal(s.held, SQK(500));
    assert.equal(await sqk.balanceOf(faucet.target), SQK(700));
  });

  it("lets only the owner change the amounts or take SQK back", async () => {
    const { owner, sqk, faucet, stranger } = await deploy();
    await revertsWith(faucet.connect(stranger).setDrip(1n, 1n, 1n), faucet, "OwnableUnauthorizedAccount");
    await revertsWith(faucet.connect(stranger).withdraw(stranger.address, 1n), faucet, "OwnableUnauthorizedAccount");
    await revertsWith(faucet.connect(owner).setDrip(0n, 1n, 1n), faucet, "BadSetup");
    await faucet.connect(owner).setDrip(SQK(50), DAY / 2, SQK(10));
    assert.equal(await faucet.dripAmount(), SQK(50));
    await faucet.connect(owner).withdraw(owner.address, SQK(1_200));
    assert.equal(await sqk.balanceOf(owner.address), SQK(1_200));
  });
});
