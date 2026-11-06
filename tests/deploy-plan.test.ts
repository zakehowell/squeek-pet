import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONTRACTS } from "../contracts/deploy/contracts.js";
import {
  DEFAULT_SETTINGS,
  OFFICIAL,
  SEASON_ONE_START,
  nextStep,
  progressKey,
  readProgress,
  readSettings,
  started,
  stepsFor,
  stepsOf,
  worldConfig,
  type Plan,
  type Progress,
} from "../contracts/deploy/plan";
import { dictOf, textKeys } from "../contracts/deploy/text";
import { readChainConfig } from "../src/world/chain/config";

const ONE = 10n ** 18n;
const OWNER = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";
const at = (n: number) => `0x${String(n).repeat(40)}` as const;
const planOf = (settings = DEFAULT_SETTINGS): Plan => {
  const read = readSettings(settings);
  if (!read.plan) throw new Error(JSON.stringify(read.problems));
  return read.plan;
};

describe("deploy plan", () => {
  it("defaults to the whitepaper's numbers, the same the local fork deploys", () => {
    const plan = planOf();
    expect(plan).toMatchObject({ name: "Squeek Pet World Token", symbol: "SQB" });
    expect(plan.prices).toEqual({
      deedBasePrice: 10_000n * ONE,
      deedCap: 100n,
      renovateLevel2Price: 500n * ONE,
      renovateLevel3Price: 1_500n * ONE,
      bannerPrice: 50_000n * ONE,
      bannersPerSeason: 8n,
      decorationPrice: 50n * ONE,
    });
    expect(plan.faucet).toEqual({ dripAmount: 1_000n * ONE, cooldown: 86_400n, maxBalance: 1_000n * ONE, fund: 20_000n * ONE });
    const local = readFileSync(new URL("../contracts/scripts/local-world.cjs", import.meta.url), "utf8");
    expect(local).toContain(`const SEASON_ONE_START = ${SEASON_ONE_START};`);
    expect(local).toContain(`const CORE = "${OFFICIAL.core}";`);
    expect(local).toContain(`const SQK = "${OFFICIAL.sqk}";`);
  });

  it("starts season 1 when the World does, Monday 2026-11-02 12:00 UTC", () => {
    expect(SEASON_ONE_START).toBe(1793620800);
  });

  it("names what is wrong with each field", () => {
    const read = readSettings({ ...DEFAULT_SETTINGS, name: " Pet ", symbol: "SQB!", deedCap: "1.5", decorationPrice: "0", bannerPrice: "", dripAmount: "abc" });
    expect(read.problems).toEqual({ name: "name", symbol: "symbol", deedCap: "count", decorationPrice: "positive", bannerPrice: "required", dripAmount: "amount" });
    expect(readSettings({ ...DEFAULT_SETTINGS, deedBasePrice: "12,500.5", deedCap: "1，000" }).plan?.prices).toMatchObject({ deedBasePrice: 12_500n * ONE + ONE / 2n, deedCap: 1000n });
  });

  it("ignores the faucet's fields when there is no faucet, and lets it start empty", () => {
    expect(readSettings({ ...DEFAULT_SETTINGS, faucet: false, dripAmount: "abc" }).plan?.faucet).toBeNull();
    expect(planOf({ ...DEFAULT_SETTINGS, fund: "0" }).faucet?.fund).toBe(0n);
  });

  it("deploys in order, each step after the ones it needs", () => {
    expect(stepsOf(planOf())).toEqual(["sqb", "minter", "setMinter", "shop", "faucet", "fund"]);
    expect(stepsOf(planOf({ ...DEFAULT_SETTINGS, fund: "0" }))).toEqual(["sqb", "minter", "setMinter", "shop", "faucet"]);
    expect(stepsOf(planOf({ ...DEFAULT_SETTINGS, faucet: false }))).toEqual(["sqb", "minter", "setMinter", "shop"]);
    expect(stepsFor({ ...DEFAULT_SETTINGS, deedCap: "oops" })).toEqual(stepsOf(planOf()));
  });

  it("passes the contracts what their constructors take", () => {
    const inputs = (name: keyof typeof CONTRACTS) => CONTRACTS[name].abi.find((e) => e.type === "constructor")?.inputs ?? [];
    expect(inputs("SqbToken").map((i) => i.type)).toEqual(["string", "string", "address"]);
    expect(inputs("SqbMinter").map((i) => i.type)).toEqual(["address", "address", "address", "address"]);
    expect(inputs("SqkFaucet").map((i) => i.type)).toEqual(["address", "uint256", "uint256", "uint256", "address"]);
    const shop = inputs("WorldShop");
    expect(shop.map((i) => i.type)).toEqual(["address", "address", "uint256", "tuple"]);
    // The prices go in by name, so the struct's fields must be exactly the plan's.
    expect(shop[3].components?.map((c) => c.name)).toEqual(Object.keys(planOf().prices));
  });
});

describe("deploy progress", () => {
  const progress = (steps: Progress["steps"]): Progress => ({ v: 1, account: OWNER, settings: DEFAULT_SETTINGS, steps });
  const all: Progress["steps"] = {
    sqb: { done: true, address: at(1) },
    minter: { done: true, address: at(2) },
    setMinter: { done: true },
    shop: { done: true, address: at(3) },
    faucet: { done: true, address: at(4) },
    fund: { done: true },
  };

  it("is kept per account and survives only intact", () => {
    const saved = JSON.stringify(progress({ sqb: { hash: `0x${"a".repeat(64)}` } }));
    expect(progressKey("0xABC")).toBe("squeek-world-deploy:v1:0xabc");
    expect(readProgress(saved, OWNER.toUpperCase().replace("0X", "0x"))?.steps.sqb?.hash).toBe(`0x${"a".repeat(64)}`);
    expect(readProgress(saved, at(9))).toBeNull();
    expect(readProgress("{not json", OWNER)).toBeNull();
    expect(readProgress(null, OWNER)).toBeNull();
  });

  it("fixes the settings once the first transaction is out, and resumes at the first step not done", () => {
    expect(started(null)).toBe(false);
    expect(started(progress({}))).toBe(false);
    expect(started(progress({ sqb: { hash: `0x${"a".repeat(64)}` } }))).toBe(true);
    expect(nextStep(progress({ sqb: { done: true, address: at(1) } }), planOf())).toBe("minter");
    expect(nextStep(progress(all), planOf())).toBeNull();
  });

  it("hands the World page a config it accepts, only when everything is done", () => {
    expect(worldConfig(progress({ ...all, fund: {} }), planOf())).toBeNull();
    const config = worldConfig(progress(all), planOf());
    expect(config).toEqual({
      chainId: 11155111,
      rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
      explorer: "https://sepolia.etherscan.io",
      core: OFFICIAL.core,
      sqk: OFFICIAL.sqk,
      sqb: at(1),
      minter: at(2),
      shop: at(3),
      faucet: at(4),
    });
    expect(readChainConfig(config)).toEqual(config);
    const noFaucet = planOf({ ...DEFAULT_SETTINGS, faucet: false });
    expect(worldConfig(progress({ sqb: all.sqb, minter: all.minter, setMinter: all.setMinter, shop: all.shop }), noFaucet)?.faucet).toBeNull();
  });
});

describe("deploy page text", () => {
  const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

  it("has every line in both languages, with the same placeholders", () => {
    const en = dictOf("en");
    const zh = dictOf("zh");
    for (const key of textKeys) {
      expect(zh[key].trim(), key).not.toBe("");
      expect(placeholders(zh[key]), key).toEqual(placeholders(en[key]));
    }
  });

  it("has text for every key the page asks for", () => {
    const page = readFileSync(new URL("../contracts/deploy/deploy.ts", import.meta.url), "utf8");
    const used = new Set([...page.matchAll(/(?:tr|labelled|StepError)\(\s*"([\w.]+)"/g)].map((m) => m[1]));
    expect(used.size).toBeGreaterThan(40);
    for (const key of used) expect(textKeys, key).toContain(key);
    // Keys built from a name: one per setting, step, status and problem.
    for (const key of Object.keys(DEFAULT_SETTINGS).filter((k) => k !== "faucet")) expect(textKeys).toContain(`settings.${key}`);
    for (const step of stepsOf(planOf())) expect(textKeys).toContain(`step.${step}`);
    for (const status of ["todo", "wallet", "mining", "done", "failed"]) expect(textKeys).toContain(`status.${status}`);
    for (const problem of ["required", "amount", "count", "positive", "name", "symbol", "tooBig"]) expect(textKeys).toContain(`problem.${problem}`);
  });
});
