const assert = require("node:assert/strict");
const { ethers } = require("hardhat");
const { SQB, SQK, WEEK, SEASON_ONE_START, PRICES, now, setTime, signPermit, revertsWith, eventArgs } = require("./helpers.cjs");

async function deploy({ prices = PRICES, seasonOneStart } = {}) {
  const [owner, alice, bob, carol, stranger] = await ethers.getSigners();
  const sqk = await ethers.deployContract("MockSqk");
  const sqb = await ethers.deployContract("SqbToken", ["Squeek Pet World Token", "SQB", owner.address]);
  // In these specs the owner mints SQB directly instead of through SqbMinter.
  await sqb.setInitialMinter(owner.address);
  const start = seasonOneStart ?? (await now()) - 60;
  const shop = await ethers.deployContract("WorldShop", [sqk.target, sqb.target, start, prices]);
  for (const who of [alice, bob, carol]) {
    await sqk.mint(who.address, SQK(1_000_000));
    await sqb.mint(who.address, SQB(10_000));
    await sqk.connect(who).approve(shop.target, ethers.MaxUint256);
    await sqb.connect(who).approve(shop.target, ethers.MaxUint256);
  }
  return { owner, alice, bob, carol, stranger, sqk, sqb, shop, start };
}

describe("WorldShop", () => {
  it("counts weekly seasons from season 1", async () => {
    const start = (await now()) + 1000;
    const { shop } = await deploy({ seasonOneStart: start });
    assert.equal(await shop.currentSeason(), 0n);
    await setTime(start);
    assert.equal(await shop.currentSeason(), 1n);
    await setTime(start + WEEK - 1);
    assert.equal(await shop.currentSeason(), 1n);
    await setTime(start + WEEK);
    assert.equal(await shop.currentSeason(), 2n);
    assert.equal(SEASON_ONE_START % WEEK, 4 * 86400 + 12 * 3600, "the game's season 1 starts on a Monday at 12:00 UTC");
  });

  it("sells numbered deeds for SQK, burns the SQK and raises the price 1% a sale", async () => {
    const { sqk, shop, alice, bob } = await deploy();
    const supplyBefore = await sqk.totalSupply();
    const [bought] = await eventArgs(shop.connect(alice).buyDeed(SQK(10_000)), shop, "DeedBought");
    assert.equal(bought.deedId, 1n);
    assert.equal(bought.price, SQK(10_000));
    assert.equal(await shop.ownerOf(1), alice.address);
    assert.equal(await shop.deedLevel(1), 1n);
    assert.equal(await sqk.totalSupply(), supplyBefore - SQK(10_000), "the SQK is burned");
    assert.equal(await sqk.balanceOf(shop.target), 0n, "the shop keeps nothing");
    assert.equal(await shop.nextDeedPrice(), SQK(10_100));
    await revertsWith(shop.connect(bob).buyDeed(SQK(10_000)), shop, "PriceAbove");
    await shop.connect(bob).buyDeed(SQK(10_100));
    assert.equal(await shop.ownerOf(2), bob.address);
    assert.equal(await shop.nextDeedPrice(), SQK(10_201));
  });

  it("stops selling deeds at the cap", async () => {
    const { shop, alice } = await deploy({ prices: { ...PRICES, deedCap: 2n } });
    await shop.connect(alice).buyDeed(SQK(20_000));
    await shop.connect(alice).buyDeed(SQK(20_000));
    await revertsWith(shop.connect(alice).buyDeed(SQK(20_000)), shop, "SoldOut");
    assert.equal(await shop.deedsSold(), 2n);
  });

  it("puts the 100th deed at about 26,780 SQK with the launch prices", async () => {
    let price = PRICES.deedBasePrice;
    for (let i = 1; i < 100; i++) price = (price * 101n) / 100n;
    assert.ok(price > SQK(26_700) && price < SQK(26_900), ethers.formatUnits(price));
  });

  it("buys a deed with an SQK permit instead of an approval", async () => {
    const { sqk, shop } = await deploy();
    const [funder] = await ethers.getSigners();
    const player = ethers.Wallet.createRandom().connect(ethers.provider);
    await funder.sendTransaction({ to: player.address, value: ethers.parseEther("1") });
    await sqk.mint(player.address, SQK(20_000));
    const deadline = BigInt((await now()) + 3600);
    const sig = await signPermit(sqk, player, shop.target, SQK(10_000), deadline);
    await shop.connect(player).buyDeedWithPermit(SQK(10_000), deadline, sig.v, sig.r, sig.s);
    assert.equal(await shop.ownerOf(1), player.address);
    assert.equal(await sqk.balanceOf(player.address), SQK(10_000));
  });

  it("lets a deed's owner name it, in Chinese too, and rejects bad names", async () => {
    const { shop, alice, bob } = await deploy();
    await shop.connect(alice).buyDeed(SQK(10_000));
    await shop.connect(alice).nameDeed(1, "仓鼠的向日葵田");
    assert.equal(await shop.deedName(1), "仓鼠的向日葵田");
    await revertsWith(shop.connect(bob).nameDeed(1, "mine"), shop, "NotDeedOwner");
    await revertsWith(shop.connect(alice).nameDeed(1, "a\nb"), shop, "BadName");
    await revertsWith(shop.connect(alice).nameDeed(1, "x".repeat(33)), shop, "BadName");
    await shop.connect(alice).nameDeed(1, "x".repeat(32));
    await shop.connect(alice).nameDeed(1, "");
    assert.equal(await shop.deedName(1), "");
  });

  it("renovates a deed to level 2 and 3 for SQB, burned, once each", async () => {
    const { sqb, shop, alice, bob } = await deploy();
    await shop.connect(alice).buyDeed(SQK(10_000));
    await revertsWith(shop.connect(bob).renovate(1), shop, "NotDeedOwner");
    const supply = await sqb.totalSupply();
    await shop.connect(alice).renovate(1);
    assert.equal(await shop.deedLevel(1), 2n);
    await shop.connect(alice).renovate(1);
    assert.equal(await shop.deedLevel(1), 3n);
    assert.equal(await sqb.totalSupply(), supply - SQB(2_000));
    await revertsWith(shop.connect(alice).renovate(1), shop, "MaxLevel");
    // The level and name travel with the deed.
    await shop.connect(alice).transferFrom(alice.address, bob.address, 1);
    assert.equal(await shop.deedLevel(1), 3n);
    await shop.connect(bob).nameDeed(1, "Bob's plot");
  });

  it("founds player guilds for SQK, at most 8 a season, with unique names", async () => {
    const { sqk, shop, alice, bob, carol } = await deploy();
    const supply = await sqk.totalSupply();
    const [founded] = await eventArgs(shop.connect(alice).foundGuild("Wheel Riders", 3, 1, 1), shop, "GuildFounded");
    assert.equal(founded.guildId, 5n, "guilds 1-4 are the built-in ones");
    assert.equal(await sqk.totalSupply(), supply - SQK(50_000));
    const g = await shop.guild(5);
    assert.equal(g.founder, alice.address);
    assert.equal(g.name, "Wheel Riders");
    assert.equal(g.flag, 3n);
    assert.equal(g.perk, 1n);
    assert.equal(await shop.guildOf(1, alice.address), 5n, "the founder joins for the season they asked");
    assert.equal(await shop.guildMembers(1, 5), 1n);
    await revertsWith(shop.connect(bob).foundGuild("Wheel Riders", 0, 0, 0), shop, "NameTaken");
    await revertsWith(shop.connect(bob).foundGuild("wheel RIDERS", 0, 0, 0), shop, "NameTaken");
    await revertsWith(shop.connect(bob).foundGuild("种子会", 0, 0, 0), shop, "NameTaken");
    await revertsWith(shop.connect(bob).foundGuild("Stardreamers", 0, 0, 0), shop, "NameTaken");
    await revertsWith(shop.connect(bob).foundGuild("seedkeepers", 0, 0, 0), shop, "NameTaken");
    await revertsWith(shop.connect(bob).foundGuild(" Spaced", 0, 0, 0), shop, "BadName");
    await revertsWith(shop.connect(bob).foundGuild("Spaced ", 0, 0, 0), shop, "BadName");
    await revertsWith(shop.connect(bob).foundGuild("Flags", 8, 0, 0), shop, "BadGuildDesign");
    await revertsWith(shop.connect(bob).foundGuild("Perks", 0, 4, 0), shop, "BadGuildDesign");
    await revertsWith(shop.connect(bob).foundGuild("Later", 0, 0, 3), shop, "BadSeason");
    for (let i = 0; i < 7; i++) await shop.connect(i % 2 ? bob : carol).foundGuild(`Guild ${i}`, i, i % 4, 0);
    await revertsWith(shop.connect(bob).foundGuild("Ninth", 0, 0, 0), shop, "BannersSoldOut");
    assert.equal(await shop.guildOf(1, bob.address), 0n, "joinSeason 0 founds without joining");
    const start = await shop.seasonOneStart();
    await setTime(Number(start) + WEEK);
    await shop.connect(bob).foundGuild("Ninth", 0, 0, 3);
    assert.equal(await shop.guildOf(3, bob.address), 13n, "a founder can join ahead for next season");
    assert.equal(await shop.guildCount(), 13n);
    const builtIn = await shop.guild(1);
    assert.equal(builtIn.name, "Seedkeepers");
    assert.equal(builtIn.founder, ethers.ZeroAddress);
    await revertsWith(shop.guild(14), shop, "NoSuchGuild");
    assert.equal(await shop.nameKey("Wheel Riders"), await shop.nameKey("wheel riders"));
  });

  it("burns SQB supplies for the week's boss and counts them for the player's guild", async () => {
    const { sqb, shop, alice, bob } = await deploy();
    await revertsWith(shop.connect(alice).supply(SQB(5)), shop, "NoGuild");
    await revertsWith(shop.connect(alice).joinGuild(0, 1), shop, "NoSuchGuild");
    await revertsWith(shop.connect(alice).joinGuild(5, 1), shop, "NoSuchGuild");
    await shop.connect(alice).joinGuild(2, 1);
    await shop.connect(bob).joinGuild(2, 1);
    const supply = await sqb.totalSupply();
    const [sent] = await eventArgs(shop.connect(alice).supply(SQB(30)), shop, "Supplied");
    assert.equal(sent.season, 1n);
    assert.equal(sent.guildId, 2n);
    await shop.connect(bob).supply(SQB("2.5"));
    assert.equal(await sqb.totalSupply(), supply - SQB("32.5"));
    assert.equal(await shop.seasonSupply(1), SQB("32.5"));
    assert.equal(await shop.guildSeasonSupply(1, 2), SQB("32.5"));
    assert.equal(await shop.playerSeasonSupply(1, alice.address), SQB(30));
    assert.equal(await shop.DAMAGE_PER_SQB(), 10n);
    await revertsWith(shop.connect(alice).supply(0), shop, "ZeroAmount");
  });

  it("keeps one guild per season, picked for this season or ahead for the next, as in the game", async () => {
    const { shop, alice, bob } = await deploy();
    const [joined] = await eventArgs(shop.connect(alice).joinGuild(1, 1), shop, "GuildJoined");
    assert.equal(joined.season, 1n);
    await revertsWith(shop.connect(alice).joinGuild(3, 1), shop, "AlreadyJoined");
    await revertsWith(shop.connect(alice).joinGuild(1, 1), shop, "AlreadyJoined");
    await revertsWith(shop.connect(alice).joinGuild(3, 0), shop, "BadSeason");
    await revertsWith(shop.connect(alice).joinGuild(3, 3), shop, "BadSeason");
    await shop.connect(alice).joinGuild(3, 2); // next season, ahead of time
    await shop.connect(alice).supply(SQB(1));
    assert.equal(await shop.guildSeasonSupply(1, 1), SQB(1), "supplies count for this season's guild");
    assert.equal(await shop.guildMembers(1, 1), 1n);
    assert.equal(await shop.guildMembers(2, 3), 1n);
    await setTime(Number(await shop.seasonOneStart()) + WEEK);
    await revertsWith(shop.connect(bob).joinGuild(2, 1), shop, "BadSeason");
    await shop.connect(alice).supply(SQB(2));
    assert.equal(await shop.guildSeasonSupply(2, 3), SQB(2));
    assert.equal(await shop.guildOf(2, alice.address), 3n);
    await revertsWith(shop.connect(bob).supply(SQB(1)), shop, "NoGuild");
  });

  it("shows the map, the guilds and a player's state in a few calls", async () => {
    const { sqk, sqb, shop, alice, bob, carol } = await deploy();
    assert.equal((await shop.deedsInRange(1, 10)).length, 0);
    await shop.connect(alice).buyDeed(SQK(10_000));
    await shop.connect(bob).buyDeed(SQK(10_100));
    await shop.connect(alice).buyDeed(SQK(10_201));
    await shop.connect(bob).nameDeed(2, "Bob's <b>plot</b>");
    await shop.connect(alice).renovate(3);
    const deeds = await shop.deedsInRange(1, 100);
    assert.equal(deeds.length, 3);
    assert.deepEqual(
      deeds.map((d) => [d.owner, d.level, d.name]),
      [
        [alice.address, 1n, ""],
        [bob.address, 1n, "Bob's <b>plot</b>"],
        [alice.address, 2n, ""],
      ],
    );
    assert.equal((await shop.deedsInRange(3, 5)).length, 1);
    assert.equal((await shop.deedsInRange(4, 5)).length, 0);
    assert.equal((await shop.deedsInRange(0, 5)).length, 0);
    assert.equal((await shop.deedsInRange(1, ethers.MaxUint256)).length, 3, "a huge count can't overflow");

    await shop.connect(carol).foundGuild("Night Owls", 2, 3, 1);
    await shop.connect(alice).joinGuild(5, 1);
    await shop.connect(bob).joinGuild(2, 1);
    await shop.connect(alice).supply(SQB(12));
    const guilds = await shop.guildsInRange(1, 50, 1);
    assert.equal(guilds.length, 5);
    assert.deepEqual(
      guilds.map((g) => [g.id, g.name, g.members, g.supply]),
      [
        [1n, "Seedkeepers", 0n, 0n],
        [2n, "Lanternbearers", 1n, 0n],
        [3n, "Cogwrights", 0n, 0n],
        [4n, "Stardreamers", 0n, 0n],
        [5n, "Night Owls", 2n, SQB(12)],
      ],
    );
    assert.equal(guilds[4].founder, carol.address);
    assert.equal(guilds[4].flag, 2n);
    assert.equal(guilds[4].perk, 3n);
    assert.equal((await shop.guildsInRange(5, 1, 2))[0].members, 0n, "members are per season");

    await shop.connect(alice).buyDecoration(2);
    await shop.connect(alice).joinGuild(1, 2);
    const o = await shop.overview(alice.address);
    assert.equal(o.season, 1n);
    assert.equal(o.deedsSold, 3n);
    assert.equal(o.nextDeedPrice, await shop.nextDeedPrice());
    assert.equal(o.guildCount, 5n);
    assert.equal(o.bannersThisSeason, 1n);
    assert.equal(o.seasonSupply, SQB(12));
    assert.equal(o.guildThisSeason, 5n);
    assert.equal(o.guildNextSeason, 1n);
    assert.equal(o.suppliedThisSeason, SQB(12));
    assert.equal(o.decorationsThisSeason, 0b100n);
    assert.equal(o.deedsOwned, 2n);
    assert.equal(o.sqkBalance, await sqk.balanceOf(alice.address));
    assert.equal(o.sqbBalance, await sqb.balanceOf(alice.address));
    assert.equal(o.sqkAllowance, ethers.MaxUint256);
    const anyone = await shop.overview(ethers.ZeroAddress);
    assert.equal(anyone.deedsSold, 3n);
    assert.equal(anyone.sqkBalance, 0n);
    const p = await shop.prices();
    assert.deepEqual([...p], Object.values(PRICES));
  });

  it("sells four decorations a season for SQB, one of each per player", async () => {
    const { sqb, shop, alice } = await deploy();
    const supply = await sqb.totalSupply();
    await shop.connect(alice).buyDecoration(0);
    await shop.connect(alice).buyDecoration(3);
    assert.equal(await shop.decorationsOf(alice.address, 1), 0b1001n);
    assert.equal(await sqb.totalSupply(), supply - SQB(100));
    await revertsWith(shop.connect(alice).buyDecoration(3), shop, "AlreadyOwned");
    await revertsWith(shop.connect(alice).buyDecoration(4), shop, "NoSuchDecoration");
    await setTime(Number(await shop.seasonOneStart()) + WEEK);
    await shop.connect(alice).buyDecoration(3);
    assert.equal(await shop.decorationsOf(alice.address, 2), 0b1000n);
    assert.equal(await shop.decorationsOf(alice.address, 1), 0b1001n, "last season's stay recorded");
    assert.deepEqual([...(await shop.decorationHistory(alice.address, 1, 3))], [0b1001n, 0b1000n, 0n]);
    assert.equal((await shop.decorationHistory(alice.address, 3, 1)).length, 0);
  });

  it("pays SQB with a permit for supplies, decorations and renovations", async () => {
    const { owner, sqk, sqb, shop } = await deploy();
    const player = ethers.Wallet.createRandom().connect(ethers.provider);
    await owner.sendTransaction({ to: player.address, value: ethers.parseEther("1") });
    await sqb.connect(owner).mint(player.address, SQB(1_000));
    await sqk.mint(player.address, SQK(10_000));
    await sqk.connect(player).approve(shop.target, SQK(10_000));
    await shop.connect(player).joinGuild(1, 1);
    const deadline = BigInt((await now()) + 3600);
    let sig = await signPermit(sqb, player, shop.target, SQB(7), deadline);
    await shop.connect(player).supplyWithPermit(SQB(7), deadline, sig.v, sig.r, sig.s);
    sig = await signPermit(sqb, player, shop.target, SQB(50), deadline);
    await shop.connect(player).buyDecorationWithPermit(1, deadline, sig.v, sig.r, sig.s);
    await shop.connect(player).buyDeed(SQK(10_000));
    sig = await signPermit(sqb, player, shop.target, SQB(500), deadline);
    await shop.connect(player).renovateWithPermit(1, SQB(500), deadline, sig.v, sig.r, sig.s);
    assert.equal(await sqb.balanceOf(player.address), SQB(1_000 - 7 - 50 - 500));
    assert.equal(await shop.deedLevel(1), 2n);
  });

  it("waits for season 1 before guild actions", async () => {
    const start = (await now()) + 1000;
    const { shop, alice } = await deploy({ seasonOneStart: start });
    await revertsWith(shop.connect(alice).foundGuild("Early", 0, 0, 0), shop, "SeasonNotStarted");
    await revertsWith(shop.connect(alice).buyDecoration(0), shop, "SeasonNotStarted");
    await revertsWith(shop.connect(alice).joinGuild(1, 2), shop, "BadSeason");
    await shop.connect(alice).joinGuild(1, 1); // ahead of season 1
    await revertsWith(shop.connect(alice).supply(SQB(1)), shop, "SeasonNotStarted");
  });

  it("has no owner and no way to take tokens out", async () => {
    const { shop } = await deploy();
    const names = shop.interface.fragments.filter((f) => f.type === "function").map((f) => f.name);
    for (const forbidden of ["owner", "withdraw", "transferOwnership", "setPrices", "rescue"]) {
      assert.ok(!names.includes(forbidden), forbidden);
    }
  });

  it("refuses a setup with a zero price or no tokens", async () => {
    const sqk = await ethers.deployContract("MockSqk");
    await assert.rejects(ethers.deployContract("WorldShop", [sqk.target, ethers.ZeroAddress, 0, PRICES]));
    await assert.rejects(ethers.deployContract("WorldShop", [sqk.target, sqk.target, 0, { ...PRICES, deedBasePrice: 0n }]));
  });
});
