import { readChainConfig, SEPOLIA_CHAIN_ID, type ChainConfig } from "../../src/world/chain/config";
import { parseAmount } from "../../src/world/chain/amount";
import type { Hex } from "../../src/world/chain/codec";
import { SEASON_EPOCH } from "../../src/world/data";

// What the deploy page deploys, in which order, and what it hands the World
// page at the end. Kept apart from the page itself so the tests can check it.

/** The official Squeekchain contracts on Sepolia (release core-sepolia-20261103). */
export const OFFICIAL = {
  core: "0xfd6c166d4b8e2962e65746a13e5a0797cd4de0c4",
  sqk: "0xd78a3956cf63164d1fa1c622ad3c66623162fa1e",
} as const satisfies Record<string, Hex>;

/** The public node the World reads from (CORS open; the site's CSP must allow it). */
export const PUBLIC_RPC = "https://ethereum-sepolia-rpc.publicnode.com";
export const EXPLORER = "https://sepolia.etherscan.io";

/** Fixed, not a setting: the World counts its seasons from this moment (SEASON_EPOCH). */
export const SEASON_ONE_START = SEASON_EPOCH / 1000;

/** The form, as typed. Amounts are whole or decimal tokens; counts are whole numbers. */
export interface Settings {
  name: string;
  symbol: string;
  deedBasePrice: string;
  deedCap: string;
  renovateLevel2Price: string;
  renovateLevel3Price: string;
  bannerPrice: string;
  bannersPerSeason: string;
  decorationPrice: string;
  faucet: boolean;
  dripAmount: string;
  cooldownHours: string;
  maxBalance: string;
  fund: string;
}

export type SettingKey = Exclude<keyof Settings, "faucet">;

/** The whitepaper's numbers, the same as contracts/scripts/local-world.cjs. */
export const DEFAULT_SETTINGS: Settings = {
  name: "Squeek Pet World Token",
  symbol: "SQB",
  deedBasePrice: "10000",
  deedCap: "100",
  renovateLevel2Price: "500",
  renovateLevel3Price: "1500",
  bannerPrice: "50000",
  bannersPerSeason: "8",
  decorationPrice: "50",
  faucet: true,
  dripAmount: "1000",
  cooldownHours: "24",
  maxBalance: "1000",
  fund: "20000",
};

/** WorldShop's Prices struct, in the order the constructor takes it. */
export interface Prices {
  deedBasePrice: bigint;
  deedCap: bigint;
  renovateLevel2Price: bigint;
  renovateLevel3Price: bigint;
  bannerPrice: bigint;
  bannersPerSeason: bigint;
  decorationPrice: bigint;
}

export interface Plan {
  name: string;
  symbol: string;
  prices: Prices;
  faucet: { dripAmount: bigint; cooldown: bigint; maxBalance: bigint; fund: bigint } | null;
}

export type SettingProblem = "required" | "amount" | "count" | "positive" | "name" | "symbol" | "tooBig";

/** The Prices struct's fields in its order: token amounts, or plain counts. */
const PRICE_FIELDS = [
  ["deedBasePrice", "amount"],
  ["deedCap", "count"],
  ["renovateLevel2Price", "amount"],
  ["renovateLevel3Price", "amount"],
  ["bannerPrice", "amount"],
  ["bannersPerSeason", "count"],
  ["decorationPrice", "amount"],
] as const satisfies readonly (readonly [keyof Prices, "amount" | "count"])[];
const FAUCET_AMOUNTS = ["dripAmount", "maxBalance"] as const;

function count(text: string): bigint | null {
  const clean = text.replace(/[,\s，_]/g, "");
  return /^\d{1,12}$/.test(clean) ? BigInt(clean) : null;
}

/** The plan the settings describe, or what is wrong with each field. */
export function readSettings(s: Settings): { plan: Plan; problems: null } | { plan: null; problems: Partial<Record<SettingKey, SettingProblem>> } {
  const problems: Partial<Record<SettingKey, SettingProblem>> = {};
  const bytes = new TextEncoder().encode(s.name.trim()).length;
  if (!s.name.trim()) problems.name = "required";
  else if (bytes > 64 || s.name !== s.name.trim()) problems.name = "name";
  if (!/^[A-Za-z0-9]{1,11}$/.test(s.symbol)) problems.symbol = s.symbol ? "symbol" : "required";

  const amount = (key: SettingKey, allowZero = false): bigint => {
    const text = s[key];
    if (!text.trim()) {
      problems[key] = "required";
      return 0n;
    }
    const value = parseAmount(text);
    if (value === null) problems[key] = "amount";
    else if (value === 0n && !allowZero) problems[key] = "positive";
    else if (value > 10n ** 30n) problems[key] = "tooBig";
    return value ?? 0n;
  };
  const whole = (key: SettingKey): bigint => {
    const text = s[key];
    if (!text.trim()) {
      problems[key] = "required";
      return 0n;
    }
    const value = count(text);
    if (value === null) problems[key] = "count";
    else if (value === 0n) problems[key] = "positive";
    return value ?? 0n;
  };

  const prices = {} as Prices;
  for (const [key, kind] of PRICE_FIELDS) prices[key] = kind === "count" ? whole(key) : amount(key);
  let faucet: Plan["faucet"] = null;
  if (s.faucet) {
    const [dripAmount, maxBalance] = FAUCET_AMOUNTS.map((key) => amount(key));
    const hours = whole("cooldownHours");
    faucet = { dripAmount, maxBalance, cooldown: hours * 3600n, fund: amount("fund", true) };
  }
  if (Object.keys(problems).length) return { plan: null, problems };
  return { plan: { name: s.name, symbol: s.symbol, prices, faucet }, problems: null };
}

export type StepId = "sqb" | "minter" | "setMinter" | "shop" | "faucet" | "fund";

/** The transactions, in order: each needs the ones before it. */
export function stepsOf(plan: Plan): StepId[] {
  const steps: StepId[] = ["sqb", "minter", "setMinter", "shop"];
  if (plan.faucet) {
    steps.push("faucet");
    if (plan.faucet.fund > 0n) steps.push("fund");
  }
  return steps;
}

/** The steps the settings ask for, even while some field is still wrong (for showing them). */
export function stepsFor(s: Settings): StepId[] {
  const steps: StepId[] = ["sqb", "minter", "setMinter", "shop"];
  if (s.faucet) {
    steps.push("faucet");
    if ((parseAmount(s.fund) ?? 0n) > 0n) steps.push("fund");
  }
  return steps;
}

/** Which steps deploy a contract (the rest call one). */
export const DEPLOYS: Partial<Record<StepId, "SqbToken" | "SqbMinter" | "WorldShop" | "SqkFaucet">> = {
  sqb: "SqbToken",
  minter: "SqbMinter",
  shop: "WorldShop",
  faucet: "SqkFaucet",
};

/** What the page remembers about a step, so a reload continues instead of deploying twice. */
export interface StepRecord {
  hash?: Hex;
  /** For deploys: the address the contract gets (from the account and the transaction's nonce). */
  address?: Hex;
  done?: boolean;
  gasUsed?: string;
}

export interface Progress {
  v: 1;
  account: Hex;
  settings: Settings;
  steps: Partial<Record<StepId, StepRecord>>;
}

export const progressKey = (account: string) => `squeek-world-deploy:v1:${account.toLowerCase()}`;

/** A saved deployment for `account`, or null. */
export function readProgress(text: string | null, account: string): Progress | null {
  if (!text) return null;
  try {
    const value = JSON.parse(text) as Progress;
    if (value?.v !== 1 || value.account?.toLowerCase() !== account.toLowerCase() || !value.settings || !value.steps) return null;
    return { ...value, settings: { ...DEFAULT_SETTINGS, ...value.settings } };
  } catch {
    return null;
  }
}

/** Has the first transaction gone out? From then on the settings can't change. */
export const started = (progress: Progress | null) => !!progress && Object.values(progress.steps).some((step) => step?.hash || step?.done);

/** The first step not done yet, or null when all are. */
export function nextStep(progress: Progress, plan: Plan): StepId | null {
  return stepsOf(plan).find((id) => !progress.steps[id]?.done) ?? null;
}

/** What the World page takes (see src/world/chain/config.ts), once every step is done. */
export function worldConfig(progress: Progress, plan: Plan, rpcUrl = PUBLIC_RPC): ChainConfig | null {
  if (nextStep(progress, plan) !== null) return null;
  const at = (id: StepId) => progress.steps[id]?.address;
  return readChainConfig({
    chainId: SEPOLIA_CHAIN_ID,
    rpcUrl,
    explorer: EXPLORER,
    core: OFFICIAL.core,
    sqk: OFFICIAL.sqk,
    sqb: at("sqb"),
    minter: at("minter"),
    shop: at("shop"),
    faucet: plan.faucet ? at("faucet") : undefined,
  });
}

/** The config as the site's file shows it: addresses checksummed by the caller if it likes. */
export const configText = (config: ChainConfig) => `${JSON.stringify(config, null, 2)}\n`;
