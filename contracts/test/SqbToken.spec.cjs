const assert = require("node:assert/strict");
const { ethers } = require("hardhat");
const { SQB, DAY, increase, now, signPermit, revertsWith } = require("./helpers.cjs");

async function deploy() {
  const [owner, minter, alice, stranger] = await ethers.getSigners();
  const sqb = await ethers.deployContract("SqbToken", ["Squeek Pet World Token", "SQB", owner.address]);
  return { owner, minter, alice, stranger, sqb };
}

describe("SqbToken", () => {
  it("starts with no supply and no minter", async () => {
    const { sqb } = await deploy();
    assert.equal(await sqb.totalSupply(), 0n);
    assert.equal(await sqb.minter(), ethers.ZeroAddress);
    assert.equal(await sqb.symbol(), "SQB");
    assert.equal(await sqb.decimals(), 18n);
  });

  it("lets only the minter mint, never the owner", async () => {
    const { owner, minter, alice, sqb } = await deploy();
    await revertsWith(sqb.connect(owner).mint(alice.address, 1n), sqb, "NotMinter");
    await sqb.connect(owner).setInitialMinter(minter.address);
    await revertsWith(sqb.connect(owner).setInitialMinter(owner.address), sqb, "MinterAlreadySet");
    await revertsWith(sqb.connect(owner).mint(alice.address, 1n), sqb, "NotMinter");
    await sqb.connect(minter).mint(alice.address, SQB(3));
    assert.equal(await sqb.balanceOf(alice.address), SQB(3));
  });

  it("hands minting to a new contract only after a public 48-hour wait", async () => {
    const { owner, minter, alice, stranger, sqb } = await deploy();
    await revertsWith(sqb.connect(owner).proposeMinter(alice.address), sqb, "MinterNotSet");
    await sqb.connect(owner).setInitialMinter(minter.address);
    await revertsWith(sqb.connect(stranger).proposeMinter(stranger.address), sqb, "OwnableUnauthorizedAccount");
    await revertsWith(sqb.connect(owner).acceptMinter(), sqb, "NoMinterProposal");
    await sqb.connect(owner).proposeMinter(alice.address);
    assert.equal(await sqb.pendingMinterReadyAt(), BigInt((await now()) + 2 * DAY));
    await revertsWith(sqb.connect(owner).acceptMinter(), sqb, "MinterProposalNotReady");
    await increase(2 * DAY - 10);
    await revertsWith(sqb.connect(owner).acceptMinter(), sqb, "MinterProposalNotReady");
    await increase(10);
    await sqb.connect(owner).acceptMinter();
    assert.equal(await sqb.minter(), alice.address);
    await revertsWith(sqb.connect(minter).mint(alice.address, 1n), sqb, "NotMinter");
    // A proposal can be withdrawn.
    await sqb.connect(owner).proposeMinter(stranger.address);
    await sqb.connect(owner).cancelMinterProposal();
    assert.equal(await sqb.pendingMinter(), ethers.ZeroAddress);
    await revertsWith(sqb.connect(owner).cancelMinterProposal(), sqb, "NoMinterProposal");
  });

  it("burns, burns from an allowance, and takes permits", async () => {
    const { owner, minter, sqb } = await deploy();
    await sqb.connect(owner).setInitialMinter(minter.address);
    const player = ethers.Wallet.createRandom().connect(ethers.provider);
    await owner.sendTransaction({ to: player.address, value: ethers.parseEther("1") });
    await sqb.connect(minter).mint(player.address, SQB(10));
    await sqb.connect(player).burn(SQB(1));
    const deadline = BigInt((await now()) + 600);
    const sig = await signPermit(sqb, player, owner.address, SQB(4), deadline);
    await sqb.permit(player.address, owner.address, SQB(4), deadline, sig.v, sig.r, sig.s);
    await sqb.connect(owner).burnFrom(player.address, SQB(4));
    assert.equal(await sqb.balanceOf(player.address), SQB(5));
    assert.equal(await sqb.totalSupply(), SQB(5));
  });
});
