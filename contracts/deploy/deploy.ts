import { BrowserProvider, Contract, ContractFactory, ZeroAddress, getAddress, getCreateAddress, isError, type ContractRunner, type JsonRpcSigner, type TransactionReceipt, type TransactionResponse } from "ethers";
import { formatAmount, parseAmount } from "../../src/world/chain/amount";
import type { Hex } from "../../src/world/chain/codec";
import { SEPOLIA_CHAIN_ID } from "../../src/world/chain/config";
import { discoverWallets, WalletSession, type WalletOption } from "../../src/world/chain/wallet";
import { CONTRACTS, type ContractName } from "./contracts.js";
import {
  DEFAULT_SETTINGS,
  DEPLOYS,
  EXPLORER,
  OFFICIAL,
  PUBLIC_RPC,
  SEASON_ONE_START,
  configText,
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
  type SettingKey,
  type Settings,
  type StepId,
  type StepRecord,
} from "./plan";
import { t, type Lang, type TextKey } from "./text";

// The deploy page: deploys Squeek Pet World's contracts to Sepolia from the
// project owner's own browser wallet (npm run deploy:page). Every transaction
// is shown in the wallet first; the page holds no key and sends nothing
// anywhere but the wallet. Progress is kept in this browser's localStorage so
// a reload continues instead of deploying twice.

type Status = "todo" | "wallet" | "mining" | "done" | "failed" | "lost";
type Check = { ok: boolean | null; text: string };

const ERC20 = ["function balanceOf(address) view returns (uint256)", "function transfer(address to, uint256 amount) returns (bool)"];
const query = new URLSearchParams(location.search);
// For trying the page on a local fork: ?rpc=http://127.0.0.1:8545 puts that node in the config.
const RPC_URL = query.get("rpc") ?? PUBLIC_RPC;

const state = {
  lang: (query.get("lang") ?? (navigator.language.startsWith("zh") ? "zh" : "en")) as Lang,
  wallets: null as WalletOption[] | null,
  picking: false,
  session: null as WalletSession | null,
  eth: null as bigint | null,
  sqk: null as bigint | null,
  official: { core: null as boolean | null, sqk: null as boolean | null },
  estimate: null as { gas: bigint; price: bigint } | null,
  settings: { ...DEFAULT_SETTINGS } as Settings,
  progress: null as Progress | null,
  status: {} as Partial<Record<StepId, Status>>,
  busy: false,
  error: null as { step: StepId | null; text: string } | null,
  results: null as Check[] | null,
  copied: false,
};
if (state.lang !== "zh" && state.lang !== "en") state.lang = "en";

const tr = (key: TextKey, values?: Record<string, string | number>) => t(state.lang, key, values);
const account = () => state.session?.account ?? null;
const onSepolia = () => state.session?.chainId === SEPOLIA_CHAIN_ID;
const plan = (): Plan | null => readSettings(state.progress?.settings ?? state.settings).plan;

// ---- DOM ----------------------------------------------------------------------------

type Child = Node | string | null | undefined | false;

function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string | boolean | ((e: Event) => void) | null | undefined> | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (typeof value === "function") node.addEventListener(key.slice(2), value);
    else if (value === true) node.setAttribute(key, "");
    else node.setAttribute(key, value);
  }
  for (const child of children) if (child !== null && child !== undefined && child !== false) node.append(child);
  return node;
}

const link = (href: string, text: string) => h("a", { href, target: "_blank", rel: "noopener noreferrer" }, text);
const checksum = (address: string) => getAddress(address);
const addressLink = (address: string) => link(`${EXPLORER}/address/${address}`, checksum(address));
const txLink = (hash: string) => link(`${EXPLORER}/tx/${hash}`, `${hash.slice(0, 10)}…${hash.slice(-6)}`);
const mark = (ok: boolean | null) => h("span", { class: `mark ${ok === null ? "wait" : ok ? "ok" : "bad"}`, "aria-hidden": "true" }, ok === null ? "…" : ok ? "✓" : "✗");
const checkList = (checks: Check[]) => h("ul", { class: "checks" }, ...checks.map((c) => h("li", null, mark(c.ok), h("span", null, c.text))));

const root = document.querySelector<HTMLElement>("#app")!;
const regions = {
  head: h("header", { class: "top" }),
  wallet: h("section", { class: "card" }),
  settings: h("section", { class: "card" }),
  deploy: h("section", { class: "card" }),
  result: h("section", { class: "card" }),
};
root.append(...Object.values(regions));

// ---- the settings form (built once, so typing keeps focus) ---------------------------

const inputs = {} as Record<SettingKey, HTMLInputElement>;
const problems = {} as Record<SettingKey, HTMLElement>;
const labels: { el: HTMLElement; key: TextKey }[] = [];
let faucetBox: HTMLInputElement;
let lockNote: HTMLElement;
let settingsLead: HTMLElement;

function labelled(key: TextKey, cls = "label") {
  const el = h("span", { class: cls }, tr(key));
  labels.push({ el, key });
  return el;
}

function field(key: SettingKey, kind: "text" | "amount" | "count", hint?: TextKey, wide = false): HTMLElement {
  const input = h("input", { type: "text", inputmode: kind === "text" ? null : kind === "count" ? "numeric" : "decimal", autocomplete: "off", spellcheck: "false", id: `f-${key}` });
  input.value = state.settings[key];
  input.addEventListener("input", () => {
    state.settings[key] = input.value;
    renderProblems();
    renderDeploy();
  });
  inputs[key] = input;
  problems[key] = h("span", { class: "problem", role: "alert" });
  return h("label", { class: wide ? "field wide" : "field", for: `f-${key}` }, labelled(`settings.${key}` as TextKey), input, hint ? labelled(hint, "hint") : null, problems[key]);
}

function buildSettings() {
  settingsLead = h("p", { class: "lead" });
  lockNote = h("p", { class: "note locked" });
  faucetBox = h("input", { type: "checkbox", id: "f-faucet" });
  faucetBox.checked = state.settings.faucet;
  faucetBox.addEventListener("change", () => {
    state.settings.faucet = faucetBox.checked;
    renderProblems();
    renderDeploy();
  });
  const season = new Date(SEASON_ONE_START * 1000).toISOString().replace("T", " ").slice(0, 16);
  regions.settings.append(
    h("h2", null, labelled("settings.head")),
    settingsLead,
    lockNote,
    h("fieldset", null, h("legend", null, labelled("settings.token")), h("div", { class: "grid" }, field("name", "text"), field("symbol", "text"))),
    h(
      "fieldset",
      null,
      h("legend", null, labelled("settings.shop")),
      h(
        "div",
        { class: "grid" },
        field("deedBasePrice", "amount", "settings.deedBasePrice.hint"),
        field("deedCap", "count"),
        field("renovateLevel2Price", "amount"),
        field("renovateLevel3Price", "amount"),
        field("bannerPrice", "amount"),
        field("bannersPerSeason", "count"),
        field("decorationPrice", "amount"),
        h("div", { class: "field" }, labelled("settings.season"), h("output", null, `${season} UTC`), labelled("settings.season.hint", "hint")),
      ),
    ),
    h(
      "fieldset",
      null,
      h("legend", null, labelled("settings.faucetHead")),
      h("label", { class: "toggle", for: "f-faucet" }, faucetBox, labelled("settings.faucet")),
      h("div", { class: "grid faucet-fields" }, field("dripAmount", "amount"), field("cooldownHours", "count"), field("maxBalance", "amount"), field("fund", "amount", "settings.fund.hint", true)),
    ),
  );
}

function renderSettings() {
  for (const { el, key } of labels) el.textContent = tr(key);
  settingsLead.textContent = tr("settings.lead");
  const locked = started(state.progress);
  const shown = state.progress?.settings ?? state.settings;
  lockNote.hidden = !locked;
  lockNote.textContent = tr("settings.locked");
  // Show what will be (or was) deployed; leave a field alone while someone types in it.
  for (const key of Object.keys(inputs) as SettingKey[]) {
    inputs[key].disabled = locked;
    if (inputs[key].value !== shown[key] && document.activeElement !== inputs[key]) inputs[key].value = shown[key];
  }
  faucetBox.disabled = locked;
  faucetBox.checked = shown.faucet;
  regions.settings.querySelector<HTMLElement>(".faucet-fields")!.hidden = !shown.faucet;
  renderProblems();
}

function renderProblems() {
  const read = readSettings(state.progress?.settings ?? state.settings);
  for (const key of Object.keys(problems) as SettingKey[]) {
    const problem = read.problems?.[key];
    problems[key].textContent = problem ? tr(`problem.${problem}`) : "";
    inputs[key].setAttribute("aria-invalid", problem ? "true" : "false");
  }
}

// ---- the wallet ---------------------------------------------------------------------

async function findWallets() {
  state.picking = true;
  renderWallet();
  state.wallets = await discoverWallets(window, 400);
  if (state.wallets.length === 1) await connect(state.wallets[0]);
  renderWallet();
}

async function connect(option: WalletOption) {
  state.session?.close();
  const session = new WalletSession(option, () => void walletChanged());
  state.session = session;
  state.picking = false;
  try {
    await session.connect(false);
    if (session.account && session.chainId !== SEPOLIA_CHAIN_ID) await session.switchToSepolia().catch(() => undefined);
  } catch (error) {
    state.error = { step: null, text: explain(error) };
  }
  await walletChanged();
}

async function walletChanged() {
  const who = account();
  // A running step finishes with the signer it started with; the loop then stops if the account moved.
  if (!state.busy) {
    state.progress = who ? readProgress(safeGet(progressKey(who)), who) : null;
    state.status = {};
    state.results = null;
    if (!state.progress && who) state.error = null;
  }
  renderAll();
  if (!who || !onSepolia()) return;
  await refresh();
}

async function refresh() {
  const who = account();
  if (!who || !onSepolia()) return renderAll();
  const provider = new BrowserProvider(state.session!.provider);
  try {
    const [eth, core, sqk] = await Promise.all([provider.getBalance(who), provider.getCode(OFFICIAL.core), provider.getCode(OFFICIAL.sqk)]);
    state.eth = eth;
    state.official = { core: core !== "0x", sqk: sqk !== "0x" };
    state.sqk = state.official.sqk ? ((await token(OFFICIAL.sqk, provider).balanceOf(who)) as bigint) : null;
  } catch (error) {
    state.error = { step: null, text: explain(error) };
  }
  renderAll();
  if (!state.busy) {
    await resume(provider);
    await estimate(provider);
  }
}

// ---- deploying ----------------------------------------------------------------------

class StepError extends Error {
  constructor(
    readonly key: TextKey,
    readonly values: Record<string, string> = {},
  ) {
    super(key);
  }
}

const factory = (name: ContractName) => new ContractFactory(CONTRACTS[name].abi, CONTRACTS[name].bytecode);
const token = (address: string, runner: ContractRunner) => new Contract(address, ERC20, runner);
const sqbToken = (address: string, runner: ContractRunner) => new Contract(address, CONTRACTS.SqbToken.abi, runner);
const addressOf = (progress: Progress, step: StepId) => progress.steps[step]?.address ?? null;

/** The deploy transaction for a step; addresses not deployed yet stand in as `fill` (for estimates). */
async function deployData(step: StepId, p: Plan, progress: Progress | null, from: string, fill?: string): Promise<string> {
  const at = (id: StepId) => (progress && addressOf(progress, id)) ?? fill ?? ZeroAddress;
  let tx;
  if (step === "sqb") tx = await factory("SqbToken").getDeployTransaction(p.name, p.symbol, from);
  else if (step === "minter") tx = await factory("SqbMinter").getDeployTransaction(OFFICIAL.core, OFFICIAL.sqk, at("sqb"), from);
  else if (step === "shop") tx = await factory("WorldShop").getDeployTransaction(OFFICIAL.sqk, at("sqb"), SEASON_ONE_START, p.prices);
  else if (step === "faucet" && p.faucet) tx = await factory("SqkFaucet").getDeployTransaction(OFFICIAL.sqk, p.faucet.dripAmount, p.faucet.cooldown, p.faucet.maxBalance, from);
  else throw new Error(`${step} deploys nothing`);
  return tx.data;
}

/** Gas for the steps still to do, at today's price. */
async function estimate(provider: BrowserProvider) {
  const p = plan();
  const who = account();
  if (!p || !who || !state.official.core || !state.official.sqk) return;
  try {
    const progress = state.progress;
    let gas = 0n;
    for (const step of stepsOf(p)) {
      if (progress?.steps[step]?.done) continue;
      if (DEPLOYS[step]) gas += await provider.estimateGas({ from: who, data: await deployData(step, p, progress, who, who) });
      else gas += step === "setMinter" ? 60_000n : 70_000n;
    }
    const fee = await provider.getFeeData();
    state.estimate = { gas, price: fee.gasPrice ?? fee.maxFeePerGas ?? 0n };
  } catch {
    state.estimate = null;
  }
  renderDeploy();
}

function save(progress: Progress) {
  try {
    localStorage.setItem(progressKey(progress.account), JSON.stringify(progress));
  } catch {
    // Private windows may refuse; the deployment still runs, it just can't resume after a reload.
  }
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** After a reload: settle steps that were sent but not seen confirmed. */
async function resume(provider: BrowserProvider) {
  const progress = state.progress;
  const p = plan();
  if (!progress || !p) return;
  for (const step of stepsOf(p)) {
    const record = progress.steps[step];
    if (record?.done) state.status[step] = "done";
    if (!record?.hash || record.done) continue;
    state.status[step] = "mining";
    renderDeploy();
    try {
      const receipt = await provider.getTransactionReceipt(record.hash);
      if (receipt) await finish(step, record, receipt, provider, progress);
      else if (await provider.getTransaction(record.hash)) void waitAndFinish(step, record, provider, progress);
      else if (await effectOnChain(step, record, provider, progress, p)) {
        record.done = true;
        save(progress);
        state.status[step] = "done";
      } else state.status[step] = "lost";
    } catch (error) {
      state.status[step] = "failed";
      state.error = { step, text: explain(error) };
    }
  }
  renderAll();
  if (nextStep(progress, p) === null) await verify();
}

/** A step whose transaction went missing (a wallet "speed up" replaces the hash): did it happen anyway? */
async function effectOnChain(step: StepId, record: StepRecord, provider: BrowserProvider, progress: Progress, p: Plan): Promise<boolean> {
  if (DEPLOYS[step]) return !!record.address && (await provider.getCode(record.address)) !== "0x";
  if (step === "setMinter") {
    const sqb = addressOf(progress, "sqb");
    return !!sqb && ((await sqbToken(sqb, provider).minter()) as string).toLowerCase() === addressOf(progress, "minter");
  }
  const faucet = addressOf(progress, "faucet");
  return !!faucet && !!p.faucet && ((await token(OFFICIAL.sqk, provider).balanceOf(faucet)) as bigint) >= p.faucet.fund;
}

async function waitAndFinish(step: StepId, record: StepRecord, provider: BrowserProvider, progress: Progress) {
  try {
    const receipt = await provider.waitForTransaction(record.hash!, 1, 30 * 60_000);
    if (receipt) await finish(step, record, receipt, provider, progress);
  } catch (error) {
    state.status[step] = "failed";
    state.error = { step, text: explain(error) };
  }
  renderAll();
}

async function finish(step: StepId, record: StepRecord, receipt: TransactionReceipt, provider: BrowserProvider, progress: Progress) {
  if (receipt.status !== 1) {
    record.hash = undefined;
    record.address = undefined;
    save(progress);
    throw new StepError("err.reverted");
  }
  record.hash = receipt.hash as Hex;
  if (DEPLOYS[step]) {
    if (receipt.contractAddress) record.address = receipt.contractAddress.toLowerCase() as Hex;
    if (!record.address || (await provider.getCode(record.address)) === "0x") throw new StepError("err.noCode", { address: record.address ?? "?" });
  }
  record.done = true;
  record.gasUsed = receipt.gasUsed.toString();
  save(progress);
  state.status[step] = "done";
}

async function send(step: StepId, signer: JsonRpcSigner, p: Plan, progress: Progress, record: StepRecord): Promise<TransactionResponse> {
  if (DEPLOYS[step]) {
    const tx = await signer.sendTransaction({ data: await deployData(step, p, progress, progress.account) });
    record.address = getCreateAddress({ from: tx.from, nonce: tx.nonce }).toLowerCase() as Hex;
    return tx;
  }
  if (step === "setMinter") {
    return (await sqbToken(addressOf(progress, "sqb")!, signer).setInitialMinter(addressOf(progress, "minter"))) as TransactionResponse;
  }
  return (await token(OFFICIAL.sqk, signer).transfer(addressOf(progress, "faucet"), p.faucet!.fund)) as TransactionResponse;
}

async function runStep(step: StepId, provider: BrowserProvider, signer: JsonRpcSigner, p: Plan, progress: Progress) {
  const record: StepRecord = (progress.steps[step] ??= {});
  // Sent before (a reload, a lost connection): never send twice what may still land.
  if (record.hash) {
    state.status[step] = "mining";
    renderDeploy();
    const receipt = (await provider.getTransactionReceipt(record.hash)) ?? ((await provider.getTransaction(record.hash)) ? await provider.waitForTransaction(record.hash, 1, 30 * 60_000) : null);
    if (receipt) return finish(step, record, receipt, provider, progress);
    if (await effectOnChain(step, record, provider, progress, p)) {
      record.done = true;
      save(progress);
      state.status[step] = "done";
      return;
    }
    // Gone without a trace (dropped by the wallet): send it again.
    record.hash = undefined;
    record.address = undefined;
    save(progress);
  }
  if (step === "setMinter") {
    const current = ((await sqbToken(addressOf(progress, "sqb")!, provider).minter()) as string).toLowerCase();
    if (current === addressOf(progress, "minter")) {
      record.done = true;
      save(progress);
      state.status[step] = "done";
      return;
    }
    if (current !== ZeroAddress) throw new StepError("err.minterTaken");
  }
  state.status[step] = "wallet";
  renderDeploy();
  const tx = await send(step, signer, p, progress, record);
  record.hash = tx.hash as Hex;
  save(progress);
  state.status[step] = "mining";
  renderDeploy();
  let receipt: TransactionReceipt | null;
  try {
    receipt = await tx.wait(1);
  } catch (error) {
    // "Speed up" in the wallet sends the same transaction again with more gas: that one counts.
    if (isError(error, "TRANSACTION_REPLACED") && !error.cancelled) receipt = error.receipt;
    else if (isError(error, "CALL_EXCEPTION") && error.receipt) receipt = error.receipt;
    else throw error;
  }
  if (!receipt) throw new StepError("deploy.lost");
  await finish(step, record, receipt, provider, progress);
}

async function deployAll() {
  const who = account();
  const p = plan();
  if (state.busy || !who || !p || !state.session) return;
  if (!onSepolia()) {
    state.error = { step: null, text: tr("err.network") };
    return renderDeploy();
  }
  const progress: Progress = state.progress ?? { v: 1, account: who, settings: { ...state.settings }, steps: {} };
  state.progress = progress;
  state.busy = true;
  state.error = null;
  let current: StepId | null = null;
  renderAll();
  try {
    const provider = new BrowserProvider(state.session.provider);
    const signer = await provider.getSigner(who);
    for (current = nextStep(progress, p); current; current = nextStep(progress, p)) {
      if (account() !== progress.account) throw new StepError("err.account", { account: checksum(progress.account) });
      if (!onSepolia()) throw new StepError("err.network");
      await runStep(current, provider, signer, p, progress);
      renderAll();
    }
    await verify();
  } catch (error) {
    // Declined or never sent: still to do. Sent and failed (or unknown): shown as failed.
    if (current) state.status[current] = state.status[current] === "wallet" && !progress.steps[current]?.hash ? "todo" : "failed";
    state.error = { step: current, text: explain(error) };
  } finally {
    state.busy = false;
    renderAll();
    void refresh();
  }
}

function restart() {
  const who = account();
  if (!who || state.busy || !window.confirm(tr("deploy.restartAsk"))) return;
  try {
    localStorage.removeItem(progressKey(who));
  } catch {
    // nothing saved
  }
  state.settings = { ...(state.progress?.settings ?? state.settings) };
  state.progress = null;
  state.status = {};
  state.results = null;
  state.error = null;
  renderAll();
  void refresh();
}

function explain(error: unknown): string {
  if (error instanceof StepError) return tr(error.key, error.values);
  const e = error as { code?: unknown; shortMessage?: string; message?: string; info?: { error?: { code?: number } } };
  if (isError(error, "ACTION_REJECTED") || e?.code === 4001 || e?.info?.error?.code === 4001) return tr("err.rejected");
  if (isError(error, "INSUFFICIENT_FUNDS") || /insufficient funds/i.test(String(e?.message))) return tr("err.noGas");
  if (isError(error, "NETWORK_ERROR")) return tr("err.network");
  if (isError(error, "CALL_EXCEPTION")) return `${tr("err.reverted")}${e.shortMessage ? ` (${e.shortMessage})` : ""}`;
  return tr("err.other", { message: String(e?.shortMessage ?? e?.message ?? error).slice(0, 240) });
}

// ---- checking the result ------------------------------------------------------------

async function verify() {
  const progress = state.progress;
  const p = plan();
  if (!progress || !p || !state.session || nextStep(progress, p) !== null) return;
  const provider = new BrowserProvider(state.session.provider);
  const at = (id: StepId) => addressOf(progress, id)!;
  const same = (a: unknown, b: string) => String(a).toLowerCase() === b.toLowerCase();
  const read = async (fn: () => Promise<boolean>) => fn().catch(() => false);
  state.results = [{ ok: null, text: tr("result.checking") }];
  renderResult();

  const sqb = new Contract(at("sqb"), CONTRACTS.SqbToken.abi, provider);
  const minter = new Contract(at("minter"), CONTRACTS.SqbMinter.abi, provider);
  const shop = new Contract(at("shop"), CONTRACTS.WorldShop.abi, provider);
  const checks: Check[] = [];
  checks.push({
    text: tr("result.sqb"),
    ok: await read(async () => same(await sqb.owner(), progress.account) && same(await sqb.minter(), at("minter")) && (await sqb.totalSupply()) === 0n && (await sqb.name()) === p.name && (await sqb.symbol()) === p.symbol),
  });
  checks.push({
    text: tr("result.minter"),
    ok: await read(async () => same(await minter.core(), OFFICIAL.core) && same(await minter.sqk(), OFFICIAL.sqk) && same(await minter.sqb(), at("sqb")) && same(await minter.owner(), progress.account) && !(await minter.mintingPaused())),
  });
  checks.push({
    text: tr("result.shop"),
    ok: await read(async () => {
      const prices = await shop.prices();
      const keys = Object.keys(p.prices) as (keyof Plan["prices"])[];
      return same(await shop.sqk(), OFFICIAL.sqk) && same(await shop.sqb(), at("sqb")) && (await shop.seasonOneStart()) === BigInt(SEASON_ONE_START) && keys.every((k) => prices[k] === p.prices[k]);
    }),
  });
  if (p.faucet) {
    const faucet = new Contract(at("faucet"), CONTRACTS.SqkFaucet.abi, provider);
    let held = 0n;
    const ok = await read(async () => {
      held = (await token(OFFICIAL.sqk, provider).balanceOf(at("faucet"))) as bigint;
      return same(await faucet.sqk(), OFFICIAL.sqk) && same(await faucet.owner(), progress.account) && (await faucet.dripAmount()) === p.faucet!.dripAmount && (await faucet.cooldown()) === p.faucet!.cooldown && (await faucet.maxBalance()) === p.faucet!.maxBalance && held >= p.faucet!.fund;
    });
    checks.push({ text: tr("result.faucet", { amount: formatAmount(held) }), ok });
  }
  const host = new URL(RPC_URL).host;
  checks.push({
    text: tr("result.rpc", { host }),
    ok: await read(async () => {
      const response = await fetch(RPC_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }) });
      return ((await response.json()) as { result?: string }).result === "0xaa36a7";
    }),
  });
  state.results = checks;
  renderResult();
}

// ---- rendering ----------------------------------------------------------------------

function switchLanguage() {
  state.lang = state.lang === "zh" ? "en" : "zh";
  renderAll();
}

function renderHead() {
  document.documentElement.lang = state.lang === "zh" ? "zh-CN" : "en";
  document.title = tr("page.title");
  regions.head.replaceChildren(
    h("div", null, h("h1", null, tr("page.title")), h("p", { class: "lead" }, tr("page.lead"))),
    h("button", { class: "btn small", type: "button", onclick: switchLanguage }, tr("page.lang")),
  );
}

function renderWallet() {
  const parts: Child[] = [h("h2", null, tr("wallet.head"))];
  const who = account();
  if (!who) {
    if (state.picking && state.wallets === null) parts.push(h("p", null, tr("wallet.looking")));
    else if (state.wallets && state.wallets.length === 0) parts.push(h("p", { class: "note warn" }, tr("wallet.none")));
    else if (state.picking && state.wallets && state.wallets.length > 1) {
      parts.push(
        h("p", null, tr("wallet.pick")),
        h("div", { class: "wallets" }, ...state.wallets.map((w) => h("button", { class: "btn", type: "button", onclick: () => void connect(w) }, w.icon ? h("img", { src: w.icon, alt: "", width: "20", height: "20" }) : null, w.name))),
      );
    } else parts.push(h("button", { class: "btn primary", type: "button", onclick: () => void findWallets() }, tr("wallet.connect")));
  } else {
    const network = onSepolia()
      ? h("span", null, mark(true), tr("wallet.sepolia"))
      : h("span", null, mark(false), tr("wallet.wrong", { id: String(state.session?.chainId ?? "?") }), " ", h("button", { class: "btn small", type: "button", onclick: () => void state.session?.switchToSepolia().then(walletChanged, (e) => ((state.error = { step: null, text: explain(e) }), renderAll())) }, tr("wallet.switch")));
    const amount = (value: bigint | null, places = 2) => (value === null ? tr("wallet.reading") : formatAmount(value, places));
    parts.push(
      h(
        "dl",
        { class: "rows" },
        h("dt", null, tr("wallet.account")),
        h("dd", null, addressLink(who)),
        h("dt", null, tr("wallet.network")),
        h("dd", null, network),
        h("dt", null, tr("wallet.eth")),
        h("dd", null, onSepolia() ? amount(state.eth, 4) : "—"),
        h("dt", null, tr("wallet.sqk")),
        h("dd", null, onSepolia() ? amount(state.sqk) : "—"),
      ),
    );
  }
  regions.wallet.replaceChildren(...parts.filter((c): c is Node | string => !!c));
}

function renderDeploy() {
  const p = plan();
  const progress = state.progress;
  const who = account();
  const parts: Child[] = [h("h2", null, tr("deploy.head"))];
  if (who && onSepolia()) {
    const checks: Check[] = [
      { ok: state.official.core, text: `${tr("check.core")} · ${checksum(OFFICIAL.core)}` },
      { ok: state.official.sqk, text: `${tr("check.sqk")} · ${checksum(OFFICIAL.sqk)}` },
    ];
    const allDone = !!progress && !!p && nextStep(progress, p) === null;
    if (!allDone) {
      if (state.estimate && state.eth !== null) {
        const need = state.estimate.gas * state.estimate.price;
        checks.push({ ok: state.eth >= need, text: tr("check.gas", { need: formatAmount(need, 4), have: formatAmount(state.eth, 4) }) });
      } else checks.push({ ok: null, text: tr("check.gasUnknown") });
      if (p?.faucet && p.faucet.fund > 0n && !progress?.steps.fund?.done) {
        checks.push({ ok: state.sqk === null ? null : state.sqk >= p.faucet.fund, text: tr("check.fund", { need: formatAmount(p.faucet.fund), have: state.sqk === null ? "…" : formatAmount(state.sqk) }) });
      }
    }
    parts.push(checkList(checks));
  }
  const shown = progress?.settings ?? state.settings;
  const ids = p ? stepsOf(p) : stepsFor(shown);
  const fund = p?.faucet?.fund ?? parseAmount(shown.fund) ?? 0n;
  {
    const steps = ids.map((id) => {
      const record = progress?.steps[id];
      const status: Status = record?.done ? "done" : (state.status[id] ?? "todo");
      const title = id === "fund" ? tr("step.fund", { amount: formatAmount(fund) }) : tr(`step.${id}` as TextKey);
      const label = status === "lost" ? tr("status.failed") : tr(`status.${status}` as TextKey);
      return h(
        "li",
        { class: `step ${status}` },
        h("div", { class: "step-head" }, h("strong", null, title), h("span", { class: `status ${status}` }, status === "wallet" || status === "mining" ? h("span", { class: "spinner", "aria-hidden": "true" }) : null, label)),
        record?.hash || record?.address
          ? h(
              "div",
              { class: "step-links" },
              record.hash ? txLink(record.hash) : null,
              record.address && (record.done || DEPLOYS[id]) ? h("span", null, " → ", addressLink(record.address)) : null,
              record.gasUsed ? h("span", { class: "muted" }, ` · ${tr("deploy.gasUsed", { gas: Number(record.gasUsed).toLocaleString("en-US") })}`) : null,
            )
          : null,
        status === "lost" ? h("p", { class: "note warn" }, tr("deploy.lost")) : null,
        state.error?.step === id ? h("p", { class: "note bad", role: "alert" }, state.error.text) : null,
      );
    });
    parts.push(h("ol", { class: "steps" }, ...steps));
  }
  if (state.error && state.error.step === null) parts.push(h("p", { class: "note bad", role: "alert" }, state.error.text));

  const remaining = ids.filter((id) => !progress?.steps[id]?.done).length;
  if (remaining > 0) {
    const blocked = !who ? tr("deploy.connectFirst") : !p ? tr("deploy.blocked") : null;
    const label = state.busy ? tr("deploy.busy") : started(progress) ? tr("deploy.continue", { n: remaining }) : tr("deploy.start", { n: remaining });
    parts.push(
      h(
        "div",
        { class: "actions" },
        h("button", { class: "btn primary", type: "button", disabled: !!blocked || state.busy || !onSepolia(), onclick: () => void deployAll() }, label),
        started(progress) && !state.busy ? h("button", { class: "btn quiet", type: "button", onclick: restart }, tr("deploy.restart")) : null,
      ),
      h("p", { class: "muted" }, blocked ?? tr("deploy.note")),
    );
  }
  regions.deploy.replaceChildren(...parts.filter((c): c is Node | string => !!c));
}

function renderResult() {
  const progress = state.progress;
  const p = plan();
  const config = progress && p ? worldConfig(progress, p, RPC_URL) : null;
  const parts: Child[] = [h("h2", null, tr("result.head"))];
  if (!config || !progress || !p) {
    parts.push(h("p", { class: "muted" }, tr("result.waiting")));
  } else {
    if (state.results) parts.push(checkList(state.results));
    const text = configText(config);
    const copy = h("button", { class: "btn small", type: "button" }, state.copied ? tr("result.copied") : tr("result.copy"));
    copy.addEventListener("click", () => {
      void navigator.clipboard?.writeText(text).then(() => {
        state.copied = true;
        renderResult();
        setTimeout(() => ((state.copied = false), renderResult()), 2000);
      });
    });
    const contracts = (["sqb", "minter", "shop", "faucet"] as StepId[]).filter((id) => progress.steps[id]?.address && stepsOf(p).includes(id));
    parts.push(
      h("div", { class: "config-head" }, h("h3", null, tr("result.config")), copy),
      h("pre", { class: "config" }, text),
      h("p", null, tr("result.next")),
      h("h3", null, tr("result.contracts")),
      h("ul", { class: "contracts" }, ...contracts.map((id) => h("li", null, h("span", null, `${DEPLOYS[id]}`), addressLink(progress.steps[id]!.address!)))),
      h("p", { class: "muted" }, tr("result.owner")),
    );
  }
  regions.result.replaceChildren(...parts.filter((c): c is Node | string => !!c));
}

function renderAll() {
  renderHead();
  renderWallet();
  renderSettings();
  renderDeploy();
  renderResult();
}

buildSettings();
renderAll();

// Reconnect silently to a wallet that already allowed this page, so a reload resumes.
void discoverWallets(window, 400).then(async (wallets) => {
  state.wallets = wallets;
  for (const option of wallets) {
    const session = new WalletSession(option, () => void walletChanged());
    const who = await session.connect(true).catch(() => null);
    if (who) {
      state.session = session;
      await walletChanged();
      return;
    }
    session.close();
  }
  renderWallet();
});
