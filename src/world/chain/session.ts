import { ERRORS } from "./abi";
import { decodeError, type Hex } from "./codec";
import { SEPOLIA_CHAIN_ID, type ChainConfig } from "./config";
import { GameChain, planPayment, type Deed, type FaucetStatus, type GuildRow, type MinterAccount, type Payment, type ShopOverview, type ShopPrices } from "./game";
import { httpProvider, isRejection, Reader, revertData, type Eip1193Provider } from "./rpc";
import { discoverWallets, WalletSession, type TxRequest, type WalletOption } from "./wallet";

// The World's link to Sepolia: which wallet is connected, what the contracts
// say about the player, and the one transaction in flight. Reads go through a
// public node every so often; every write is simulated first, so a payment
// that would fail is explained before the wallet even asks.

export type ChainAction =
  | "stake"
  | "unstake"
  | "claim"
  | "sync"
  | "drip"
  | "buyDeed"
  | "nameDeed"
  | "renovate"
  | "joinGuild"
  | "foundGuild"
  | "supply"
  | "decoration";

export type BusyStep = "wallet" | "sign" | "approve" | "send" | "confirm";

export interface Busy {
  action: ChainAction;
  step: BusyStep;
  hash: Hex | null;
}

/** Why something didn't happen, as a message key for the chain dictionary. */
export interface Problem {
  key: string;
  hash?: Hex;
}

export type Outcome = { ok: true; hash: Hex | null } | { ok: false; problem: Problem };

export interface ChainState {
  config: ChainConfig;
  /** Wallets found in this browser; null while looking. */
  wallets: WalletOption[] | null;
  wallet: WalletOption | null;
  account: Hex | null;
  chainId: number | null;
  connecting: boolean;
  /** Reconnecting, without a prompt, the wallet used here last time. */
  resuming: boolean;
  minter: MinterAccount | null;
  prices: ShopPrices | null;
  overview: ShopOverview | null;
  deeds: Deed[] | null;
  guilds: GuildRow[] | null;
  faucet: FaucetStatus | null;
  /** Decoration bits per season, index 0 for season 1. */
  decorations: number[] | null;
  /** SQB supplies (wei) by season, for the boss. */
  supplies: Map<number, bigint>;
  /** Sepolia ETH for gas, wei. */
  gas: bigint | null;
  readFailed: boolean;
  readAt: number | null;
  busy: Busy | null;
}

const WALLET_KEY = "squeek-world:wallet";
const POLL_MS = 20_000;
const RECEIPT_MS = 2_000;
const RECEIPT_TRIES = 150;

const KNOWN_ERRORS = new Set([
  "PriceAbove",
  "SoldOut",
  "NotDeedOwner",
  "MaxLevel",
  "BadName",
  "NameTaken",
  "BadGuildDesign",
  "BannersSoldOut",
  "NoSuchGuild",
  "BadSeason",
  "AlreadyJoined",
  "NoGuild",
  "NoSuchDecoration",
  "AlreadyOwned",
  "SeasonNotStarted",
  "ZeroAmount",
  "NotEnoughStaked",
  "TooSoon",
  "AlreadyHasSqk",
  "FaucetEmpty",
  "ERC20InsufficientBalance",
  "ERC20InsufficientAllowance",
  "ERC2612ExpiredSignature",
  "NotMinter",
]);

/** The message key for a failed request. */
export function explain(error: unknown): Problem {
  if (isRejection(error)) return { key: "err.rejected" };
  const data = revertData(error);
  const decoded = data ? decodeError(ERRORS, data) : null;
  if (decoded && KNOWN_ERRORS.has(decoded.name)) return { key: `err.${decoded.name}` };
  const message = String((error as Error)?.message ?? error);
  if (/insufficient funds/i.test(message)) return { key: "err.noGas" };
  if (decoded || /revert/i.test(message)) return { key: "err.reverted" };
  return { key: "err.failed" };
}

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Without storage the wallet just isn't remembered.
  }
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class ChainSession {
  readonly state: ChainState;
  readonly chain: GameChain;
  private session: WalletSession | null = null;
  private pollTimer: number | null = null;
  private reading = false;
  private closed = false;
  private readonly http: Eip1193Provider;

  constructor(
    config: ChainConfig,
    private readonly onChange: (what: "wallet" | "data" | "busy") => void,
    private readonly win: Window = window,
  ) {
    this.state = {
      config,
      wallets: null,
      wallet: null,
      account: null,
      chainId: null,
      connecting: false,
      resuming: stored(WALLET_KEY) !== null,
      minter: null,
      prices: null,
      overview: null,
      deeds: null,
      guilds: null,
      faucet: null,
      decorations: null,
      supplies: new Map(),
      gas: null,
      readFailed: false,
      readAt: null,
      busy: null,
    };
    this.http = httpProvider(config.rpcUrl);
    // The public node first; the wallet, when it is on Sepolia, if the node can't be reached.
    const reader = new Reader(() => (this.session && this.state.chainId === SEPOLIA_CHAIN_ID ? [this.http, this.session.provider] : [this.http]));
    this.chain = new GameChain(config, reader);
  }

  get onSepolia(): boolean {
    return this.state.chainId === SEPOLIA_CHAIN_ID;
  }

  /** Finds the wallets and reconnects, without a prompt, the one used here last time. */
  async start(): Promise<void> {
    const wallets = await discoverWallets(this.win);
    if (this.closed) return;
    this.state.wallets = wallets;
    const last = stored(WALLET_KEY);
    const again = wallets.find((w) => w.id === last);
    try {
      if (again) await this.connect(again, true);
    } finally {
      this.state.resuming = false;
      if (!this.closed) this.onChange("wallet");
    }
  }

  async rediscover(): Promise<void> {
    this.state.wallets = await discoverWallets(this.win);
    this.onChange("wallet");
  }

  /** Connects `option`; with `silent`, only if the wallet already allowed this site. */
  async connect(option: WalletOption, silent = false): Promise<Problem | null> {
    if (this.state.connecting) return null;
    this.session?.close();
    const session = new WalletSession(option, () => this.walletChanged());
    this.state.connecting = !silent;
    this.onChange("wallet");
    try {
      const account = await session.connect(silent);
      if (this.closed) return null;
      if (!account) {
        session.close();
        if (silent) store(WALLET_KEY, null);
        return silent ? null : { key: "err.noAccount" };
      }
      this.session = session;
      this.state.wallet = option;
      this.state.account = account;
      this.state.chainId = session.chainId;
      store(WALLET_KEY, option.id);
      this.resetData();
      void this.refresh();
      return null;
    } catch (error) {
      session.close();
      return silent ? null : explain(error);
    } finally {
      this.state.connecting = false;
      this.onChange("wallet");
    }
  }

  disconnect() {
    this.session?.close(true);
    this.session = null;
    this.state.wallet = null;
    this.state.account = null;
    this.state.chainId = null;
    store(WALLET_KEY, null);
    this.resetData();
    this.stopPolling();
    this.onChange("wallet");
  }

  private resetData() {
    Object.assign(this.state, { minter: null, overview: null, deeds: null, guilds: null, faucet: null, decorations: null, gas: null, readAt: null, readFailed: false });
    this.state.supplies = new Map();
  }

  private walletChanged() {
    const account = this.session?.account ?? null;
    const changed = account !== this.state.account;
    this.state.account = account;
    this.state.chainId = this.session?.chainId ?? null;
    if (!account) {
      this.disconnect();
      return;
    }
    if (changed) this.resetData();
    this.onChange("wallet");
    void this.refresh();
  }

  async switchChain(): Promise<Problem | null> {
    if (!this.session) return { key: "err.noWallet" };
    try {
      await this.session.switchToSepolia();
      this.state.chainId = this.session.chainId;
      this.onChange("wallet");
      return null;
    } catch (error) {
      return explain(error);
    }
  }

  // ---- Reads ----------------------------------------------------------------------

  private schedule(ms = POLL_MS) {
    this.stopPolling();
    if (!this.closed && this.state.account) this.pollTimer = this.win.setTimeout(() => void this.refresh(), ms);
  }

  private stopPolling() {
    if (this.pollTimer !== null) this.win.clearTimeout(this.pollTimer);
    this.pollTimer = null;
  }

  /** Reads everything the World shows for the connected player. */
  async refresh(): Promise<void> {
    const who = this.state.account;
    if (!who || this.reading || this.closed) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden" && this.state.readAt) {
      this.schedule();
      return;
    }
    this.reading = true;
    try {
      const c = this.chain;
      const [minter, overview, prices, gas] = await Promise.all([c.minterAccount(who), c.overview(who), this.state.prices ? Promise.resolve(this.state.prices) : c.prices(), c.reader.balance(who)]);
      const season = overview.season;
      const [deeds, guilds, faucet, decorations, lastSupply] = await Promise.all([
        c.deeds(overview.deedsSold),
        c.guilds(overview.guildCount, season),
        c.faucetStatus(who),
        c.decorationHistory(who, season),
        season > 1 ? c.seasonSupply(season - 1) : Promise.resolve(0n),
      ]);
      if (this.closed || who !== this.state.account) return;
      const supplies = new Map(this.state.supplies);
      supplies.set(season, overview.seasonSupply);
      if (season > 1) supplies.set(season - 1, lastSupply);
      Object.assign(this.state, { minter, overview, prices, gas, deeds, guilds, faucet, decorations, supplies, readFailed: false, readAt: Date.now() });
    } catch (error) {
      console.warn("[squeek-world] chain read failed", error);
      this.state.readFailed = true;
    } finally {
      this.reading = false;
      this.onChange("data");
      this.schedule(this.state.readFailed ? 60_000 : POLL_MS);
    }
  }

  // ---- Writes ---------------------------------------------------------------------

  private setBusy(busy: Busy | null) {
    this.state.busy = busy;
    this.onChange("busy");
  }

  private async receipt(hash: Hex) {
    for (let i = 0; i < RECEIPT_TRIES && !this.closed; i++) {
      try {
        const r = await this.chain.reader.receipt(hash);
        if (r) return r;
      } catch {
        // The node may not know the transaction yet.
      }
      await wait(RECEIPT_MS);
    }
    return null;
  }

  /**
   * Sends the transactions `plan` returns, one by one: each is simulated, sent
   * through the wallet and waited for. One action runs at a time.
   */
  private async run(action: ChainAction, plan: () => Promise<TxRequest[]>): Promise<Outcome> {
    if (this.state.busy) return { ok: false, problem: { key: "err.busy" } };
    const session = this.session;
    if (!session?.account) return { ok: false, problem: { key: "err.noWallet" } };
    this.setBusy({ action, step: "wallet", hash: null });
    let hash: Hex | null = null;
    try {
      if (!this.onSepolia) {
        await session.switchToSepolia();
        this.state.chainId = session.chainId;
        if (!this.onSepolia) return { ok: false, problem: { key: "err.wrongChain" } };
      }
      const txs = await plan();
      for (const tx of txs) {
        // Simulate first so a failing call is explained before the wallet asks.
        await this.chain.reader.call(tx.to, tx.data, session.account);
        this.setBusy({ action, step: "send", hash: null });
        hash = await session.send(tx);
        this.setBusy({ action, step: "confirm", hash });
        const receipt = await this.receipt(hash);
        if (!receipt) return { ok: false, problem: { key: "err.slow", hash } };
        if (receipt.status !== "success") return { ok: false, problem: { key: "err.reverted", hash } };
      }
      return { ok: true, hash };
    } catch (error) {
      return { ok: false, problem: { ...explain(error), ...(hash ? { hash } : {}) } };
    } finally {
      this.setBusy(null);
      void this.refresh();
    }
  }

  private pay(action: ChainAction, payment: Payment, allowance?: bigint): Promise<Outcome> {
    return this.run(action, () =>
      planPayment(this.chain, this.session!, payment, {
        allowance,
        onStep: (step) => this.setBusy({ action, step: step === "sign" ? "sign" : step === "approve" ? "approve" : "send", hash: null }),
      }),
    );
  }

  stake(amount: bigint) {
    return this.pay("stake", this.chain.pay.stake(amount), this.state.minter?.sqkAllowance);
  }

  unstake(amount: bigint) {
    return this.run("unstake", async () => [this.chain.tx.unstake(amount)]);
  }

  claim() {
    return this.run("claim", async () => [this.chain.tx.claim()]);
  }

  sync() {
    return this.run("sync", async () => [this.chain.tx.sync()]);
  }

  drip() {
    return this.run("drip", async () => [this.chain.tx.drip()]);
  }

  buyDeed(price: bigint) {
    return this.pay("buyDeed", this.chain.pay.buyDeed(price), this.state.overview?.sqkAllowance);
  }

  nameDeed(deed: number, name: string) {
    return this.run("nameDeed", async () => [this.chain.tx.nameDeed(deed, name)]);
  }

  renovate(deed: number, price: bigint) {
    return this.pay("renovate", this.chain.pay.renovate(price, deed), this.state.overview?.sqbAllowance);
  }

  joinGuild(guild: number, season: number) {
    return this.run("joinGuild", async () => [this.chain.tx.joinGuild(guild, season)]);
  }

  foundGuild(name: string, flag: number, perk: number, joinSeason: number) {
    const price = this.state.prices?.bannerPrice ?? 0n;
    return this.pay("foundGuild", this.chain.pay.foundGuild(price, name, flag, perk, joinSeason), this.state.overview?.sqkAllowance);
  }

  supply(amount: bigint) {
    return this.pay("supply", this.chain.pay.supply(amount), this.state.overview?.sqbAllowance);
  }

  buyDecoration(index: number) {
    const price = this.state.prices?.decorationPrice ?? 0n;
    return this.pay("decoration", this.chain.pay.decoration(price, index), this.state.overview?.sqbAllowance);
  }

  close() {
    this.closed = true;
    this.stopPolling();
    this.session?.close();
  }
}

/** SQB the player can claim at `now` (ms), counting on from the last read. */
export function liveClaimable(minter: MinterAccount, now: number): bigint {
  if (!minter.staked || !minter.totalStaked || !minter.ratePerSecond) return minter.claimable;
  const end = minter.streamEnds * 1000;
  const elapsed = Math.max(0, Math.min(now, end) - minter.readAt);
  return minter.claimable + (BigInt(Math.floor(elapsed)) * minter.ratePerSecond * minter.staked) / (1000n * minter.totalStaked);
}

/** The player's SQB per day at the current stream rate. */
export function dailyRate(minter: MinterAccount, now: number): bigint {
  if (!minter.staked || !minter.totalStaked || now >= minter.streamEnds * 1000) return 0n;
  return (minter.ratePerSecond * 86_400n * minter.staked) / minter.totalStaked;
}
