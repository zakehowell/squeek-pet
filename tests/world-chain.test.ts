import { readdirSync, readFileSync } from "node:fs";
import { id } from "ethers";
import { describe, expect, it } from "vitest";
import { sharedBoss, supplyDamage } from "../src/world/boss";
import { formatAmount, inputAmount, parseAmount } from "../src/world/chain/amount";
import { readChainConfig } from "../src/world/chain/config";
import type { ShopOverview } from "../src/world/chain/game";
import { dailyRate, explain, liveClaimable } from "../src/world/chain/session";
import { applyChoice, check, newWorld } from "../src/world/engine";
import { CHAIN_KEYS, chainDict, ct, hasChainKey } from "../src/world/i18n-chain";
import { adoptLegacySave, importSave, loadSave, saveKey, writeSave } from "../src/world/store";
import { foundWorld } from "../src/world/sync";
import type { WorkBucket } from "../src/world/feed";
import { displayName, nameProblem } from "../src/world/ui/chain-parts";
import type { View } from "../src/world/ui/parts";
import { joinableSeason, localGuildOf } from "../src/world/ui/war";
import { memoryStorage, T } from "./world-helpers";

const ONE = 10n ** 18n;
const source = (path: string) => readFileSync(new URL(`../src/world/${path}`, import.meta.url), "utf8");
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("on-chain text", () => {
  it("has every key in both languages, with the same placeholders", () => {
    const en = chainDict("en");
    const zh = chainDict("zh");
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
    for (const key of CHAIN_KEYS) {
      expect(zh[key].trim(), key).not.toBe("");
      expect(placeholders(zh[key]), key).toEqual(placeholders(en[key]));
    }
  });

  it("has text for every key the on-chain parts ask for", () => {
    const files = ["app.ts", "chain/session.ts", ...readdirSync(new URL("../src/world/ui/", import.meta.url)).map((f) => `ui/${f}`)];
    const used = new Set<string>();
    for (const file of files) {
      for (const match of source(file).matchAll(/\b(?:ctr\(v|ct\((?:v\.)?lang|ct\(w\.lang)\s*,\s*"([\w.]+)"/g)) used.add(match[1]);
      for (const match of source(file).matchAll(/key: "(err\.\w+)"/g)) used.add(match[1]);
    }
    expect(used.size).toBeGreaterThan(100);
    for (const key of used) expect(hasChainKey(key), key).toBe(true);
  });

  it("explains every contract error the session knows by name", () => {
    const known = [...source("chain/session.ts").matchAll(/^ {2}"(\w+)",$/gm)].map((m) => m[1]);
    expect(known.length).toBeGreaterThan(20);
    for (const name of known) expect(hasChainKey(`err.${name}`), name).toBe(true);
  });

  it("fills in values", () => {
    expect(ct("en", "done.supply", { amount: "12.5", damage: 125 })).toBe("Sent 12.5 SQB of supplies: 125 damage to the boss.");
    expect(ct("zh", "town.sold", { n: 3, cap: 100 })).toBe("已售 3 / 100");
  });
});

describe("amounts", () => {
  it("reads what players type", () => {
    expect(parseAmount("1,250.5")).toBe(1250n * ONE + ONE / 2n);
    expect(parseAmount(" 12。5 ")).toBe(12n * ONE + ONE / 2n);
    expect(parseAmount("1，000")).toBe(1000n * ONE);
    expect(parseAmount(".25")).toBe(ONE / 4n);
    expect(parseAmount("0.000000000000000001")).toBe(1n);
    for (const bad of ["", ".", "abc", "1.2.3", "-5", "1e18", "0.0000000000000000001"]) expect(parseAmount(bad), bad).toBeNull();
  });

  it("shows amounts cut, never rounded up", () => {
    expect(formatAmount(1234n * ONE + (ONE * 999n) / 1000n)).toBe("1,234.99");
    expect(formatAmount(5n * ONE)).toBe("5");
    expect(formatAmount(1n)).toBe("<0.01");
    expect(formatAmount(1n, 4)).toBe("<0.0001");
    expect(formatAmount(0n)).toBe("0");
    expect(inputAmount(12n * ONE + ONE / 8n)).toBe("12.125");
  });
});

describe("chain config", () => {
  const good = {
    rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
    core: "0xfd6c166d4b8e2962e65746a13e5a0797cd4de0c4",
    sqk: "0xd78a3956cf63164d1fa1c622ad3c66623162fa1e",
    sqb: `0x${"1".repeat(40)}`,
    minter: `0x${"2".repeat(40)}`,
    shop: `0x${"3".repeat(40)}`,
  };

  it("takes a complete Sepolia deployment and nothing else", () => {
    expect(readChainConfig(good)?.faucet).toBeNull();
    expect(readChainConfig({ ...good, faucet: `0x${"A".repeat(40)}` })?.faucet).toBe(`0x${"a".repeat(40)}`);
    expect(readChainConfig(undefined)).toBeNull();
    expect(readChainConfig({ ...good, chainId: 1 })).toBeNull();
    expect(readChainConfig({ ...good, rpcUrl: "http://example.com" })).toBeNull();
    expect(readChainConfig({ ...good, shop: "0x123" })).toBeNull();
  });
});

describe("staking numbers", () => {
  const minter = {
    staked: 100n * ONE,
    claimable: ONE,
    totalStaked: 400n * ONE,
    ratePerSecond: ONE / 1000n,
    streamEnds: 2_000,
    readAt: 1_000_000,
  } as Parameters<typeof liveClaimable>[0];

  it("counts SQB up by the second between reads, until the stream ends", () => {
    // 10 s at 0.001 SQB/s for everyone, a quarter of it ours.
    expect(liveClaimable(minter, 1_010_000)).toBe(ONE + (10n * ONE) / 1000n / 4n);
    expect(liveClaimable(minter, 5_000_000)).toBe(liveClaimable(minter, 2_000_000));
    expect(dailyRate(minter, 1_500_000)).toBe((86_400n * ONE) / 1000n / 4n);
    expect(dailyRate(minter, 2_000_000)).toBe(0n);
  });
});

describe("explaining failures", () => {
  const selector = (signature: string) => id(signature).slice(0, 10);

  it("names contract errors, wallet refusals and missing gas", () => {
    expect(explain({ code: -32000, message: "execution reverted", data: selector("NameTaken()") }).key).toBe("err.NameTaken");
    const tooSoon = selector("TooSoon(uint256)") + (1_800_000_000).toString(16).padStart(64, "0");
    expect(explain({ code: 3, message: "reverted", data: { data: tooSoon } }).key).toBe("err.TooSoon");
    expect(explain({ code: 4001, message: "User rejected the request." }).key).toBe("err.rejected");
    expect(explain(new Error("insufficient funds for gas * price + value")).key).toBe("err.noGas");
    expect(explain(new Error("network down")).key).toBe("err.failed");
  });
});

describe("names on Sepolia", () => {
  it("checks names the way WorldShop does", () => {
    expect(nameProblem("Seed Club")).toBeNull();
    expect(nameProblem("仓鼠互助会")).toBeNull();
    expect(nameProblem("一二三四五六七八九十")).toBeNull(); // 30 bytes
    expect(nameProblem("一二三四五六七八九十一")).toBe("err.BadName"); // 33 bytes
    expect(nameProblem("x".repeat(33))).toBe("err.BadName");
    expect(nameProblem(" Seed")).toBe("err.BadName");
    expect(nameProblem("")).toBe("err.BadName");
    expect(nameProblem("Se​ed")).toBe("err.BadName");
  });

  it("drops invisible and direction-changing characters from names it shows", () => {
    expect(displayName("‮evil‬ Guild​")).toBe("evil Guild");
    expect(displayName("  ")).toBe("");
  });
});

describe("deeds in the world", () => {
  it("adds one more bed per world, labelled with its deed", () => {
    const world = newWorld(100, T);
    const beds = world.plots.length;
    expect(check(world, { t: "deed", deed: 0 })).toBe("err.unknown");
    expect(applyChoice(world, { t: "deed", deed: 7 })).toBeNull();
    expect(world.plots.length).toBe(beds + 1);
    expect(world.plots[beds]).toMatchObject({ area: "meadow", plant: null, deed: 7 });
    expect(world.deed).toBe(7);
    expect(check(world, { t: "deed", deed: 8 })).toBe("err.deedPlaced");
  });
});

describe("one world per wallet", () => {
  const A = "0xAbCdEf0000000000000000000000000000000001";
  const B = "0xabcdef0000000000000000000000000000000002";

  it("keeps each wallet's world in its own slot", () => {
    const storage = memoryStorage();
    expect(saveKey("real", A)).toBe(`squeek-world:real:v1:${A.toLowerCase()}`);
    expect(saveKey("sim", A)).toBe("squeek-world:sim:v1");
    writeSave(foundWorld(10, "install", T, A), storage);
    expect(loadSave("real", storage, A)?.owner).toBe(A.toLowerCase());
    expect(loadSave("real", storage, B)).toBeNull();
    expect(loadSave("real", storage)).toBeNull();
  });

  it("gives the world played before wallets to the first wallet only", () => {
    const storage = memoryStorage();
    writeSave(foundWorld(10, "install", T), storage);
    const adopted = adoptLegacySave(A, storage);
    expect(adopted?.owner).toBe(A.toLowerCase());
    expect(adopted?.base.frontier).toBe(10);
    expect(adoptLegacySave(B, storage)).toBeNull();
    expect(adoptLegacySave(A, storage)?.owner).toBe(A.toLowerCase());
    expect(loadSave("real", storage)).not.toBeNull();
  });

  it("moves an imported world into the connected wallet's slot", () => {
    const text = JSON.stringify(foundWorld(10, "install", T, A));
    expect(importSave(text, "real", B)?.owner).toBe(B.toLowerCase());
    expect(importSave(text, "real", null)?.owner).toBeUndefined();
    expect(importSave(text, "sim")).toBeNull();
  });
});

describe("guild war", () => {
  const days: WorkBucket[] = [{ startAt: T, work: 20_000 } as WorkBucket];
  const empty = { events: [], coveredFrom: 0, since: 0, older: null } as never;

  it("adds SQB supplies to the boss, uncapped, once they're read", () => {
    expect(supplyDamage(ONE * 3n + ONE / 2n)).toBe(35);
    const plain = sharedBoss(1, days, empty, empty);
    expect(plain.hasSupplies).toBe(false);
    const unknown = sharedBoss(1, days, empty, empty, null);
    expect(unknown).toMatchObject({ hasSupplies: true, supplies: null, complete: false, damage: plain.damage });
    const supplied = sharedBoss(1, days, empty, empty, 40_000);
    expect(supplied.damage).toBe(plain.damage! + 40_000);
    expect(supplied.defeated).toBe(true);
  });

  it("plays a founded guild as the built-in guild of its perk", () => {
    expect(localGuildOf({ id: 2, perk: 0 })).toBe("lantern");
    expect(localGuildOf({ id: 9, perk: 3 })).toBe("star");
  });

  it("offers the first season the world can still take a guild with that perk", () => {
    const world = newWorld(100, T);
    const v = { world } as View;
    const o = { season: 1, guildThisSeason: 0, guildNextSeason: 0 } as ShopOverview;
    expect(joinableSeason(v, o, "seed")).toBe(1);
    expect(joinableSeason(v, { ...o, guildThisSeason: 3 }, "seed")).toBe(2);
    expect(joinableSeason(v, { ...o, guildThisSeason: 3, guildNextSeason: 1 }, "seed")).toBe(0);
    applyChoice(world, { t: "guild", guild: "cog", season: 1 });
    expect(joinableSeason(v, o, "seed")).toBe(2);
    expect(joinableSeason(v, o, "cog")).toBe(1);
  });
});
