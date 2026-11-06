import { FUNCTIONS } from "./abi";
import { decodeResult, encodeCall, type AbiFunction, type Hex } from "./codec";
import type { ChainConfig } from "./config";
import { isRejection, type Reader } from "./rpc";
import { splitSignature, type TxRequest, type TypedData, type WalletSession } from "./wallet";

// Squeek Pet World's contracts, as the World uses them: typed reads, and the
// transactions behind each button. Paying with SQK or SQB takes one permit
// signature and one transaction where the wallet can sign permits, an
// approval and the transaction where it can't, and just the transaction when
// enough is already approved.

const T = FUNCTIONS.SqbToken;
const M = FUNCTIONS.SqbMinter;
const S = FUNCTIONS.WorldShop;
const F = FUNCTIONS.SqkFaucet;

export const PauseReasons = ["none", "owner", "implementationChanged", "regressed", "tooMuchWork", "badFormat"] as const;
export type PauseReason = (typeof PauseReasons)[number];

export interface MinterAccount {
  staked: bigint;
  claimable: bigint;
  totalStaked: bigint;
  /** SQB (wei) the whole stream pays per second now. */
  ratePerSecond: bigint;
  /** Unix seconds when the stream runs dry, 0 if it never ran. */
  streamEnds: number;
  pendingWork: number;
  pause: PauseReason;
  lastRound: number;
  lastWork: number;
  totalScheduled: bigint;
  totalClaimed: bigint;
  sqkBalance: bigint;
  sqkAllowance: bigint;
  sqbBalance: bigint;
  /** When this was read, ms. */
  readAt: number;
}

export interface ShopPrices {
  deedBasePrice: bigint;
  deedCap: number;
  renovateLevel2Price: bigint;
  renovateLevel3Price: bigint;
  bannerPrice: bigint;
  bannersPerSeason: number;
  decorationPrice: bigint;
}

export interface ShopOverview {
  season: number;
  deedsSold: number;
  nextDeedPrice: bigint;
  guildCount: number;
  bannersThisSeason: number;
  seasonSupply: bigint;
  guildThisSeason: number;
  guildNextSeason: number;
  suppliedThisSeason: bigint;
  decorationsThisSeason: number;
  deedsOwned: number;
  sqkBalance: bigint;
  sqbBalance: bigint;
  sqkAllowance: bigint;
  sqbAllowance: bigint;
}

export interface Deed {
  id: number;
  owner: Hex;
  level: number;
  name: string;
}

export interface GuildRow {
  id: number;
  /** 0x0 for the four built-in guilds. */
  founder: Hex;
  foundedSeason: number;
  flag: number;
  perk: number;
  name: string;
  members: number;
  supply: bigint;
}

export interface FaucetStatus {
  amount: bigint;
  /** Seconds between drips. */
  wait: number;
  /** A wallet holding this much SQK or more can't take any. */
  limit: bigint;
  left: bigint;
  /** Unix seconds of the player's next drip, 0 if they never took one. */
  nextAt: number;
  held: bigint;
}

type Row = Record<string, unknown>;
const big = (v: unknown) => v as bigint;
const int = (v: unknown) => Number(v as bigint);

export class GameChain {
  constructor(
    readonly config: ChainConfig,
    readonly reader: Reader,
  ) {}

  private async read(to: Hex, fn: AbiFunction, args: readonly unknown[] = []): Promise<unknown> {
    return decodeResult(fn, await this.reader.call(to, encodeCall(fn, args)));
  }

  async minterAccount(who: Hex | null): Promise<MinterAccount> {
    const a = (await this.read(this.config.minter, M.account, [who ?? `0x${"0".repeat(40)}`])) as Row;
    return {
      staked: big(a.staked),
      claimable: big(a.claimable),
      totalStaked: big(a.totalStaked),
      ratePerSecond: big(a.ratePerSecond),
      streamEnds: int(a.streamEnds),
      pendingWork: int(a.pendingWork),
      pause: PauseReasons[int(a.pauseReason)] ?? "badFormat",
      lastRound: int(a.lastRound),
      lastWork: int(a.lastWork),
      totalScheduled: big(a.totalScheduled),
      totalClaimed: big(a.totalClaimed),
      sqkBalance: big(a.sqkBalance),
      sqkAllowance: big(a.sqkAllowance),
      sqbBalance: big(a.sqbBalance),
      readAt: Date.now(),
    };
  }

  async prices(): Promise<ShopPrices> {
    const p = (await this.read(this.config.shop, S.prices)) as Row;
    return {
      deedBasePrice: big(p.deedBasePrice),
      deedCap: int(p.deedCap),
      renovateLevel2Price: big(p.renovateLevel2Price),
      renovateLevel3Price: big(p.renovateLevel3Price),
      bannerPrice: big(p.bannerPrice),
      bannersPerSeason: int(p.bannersPerSeason),
      decorationPrice: big(p.decorationPrice),
    };
  }

  async overview(who: Hex | null): Promise<ShopOverview> {
    const o = (await this.read(this.config.shop, S.overview, [who ?? `0x${"0".repeat(40)}`])) as Row;
    return {
      season: int(o.season),
      deedsSold: int(o.deedsSold),
      nextDeedPrice: big(o.nextDeedPrice),
      guildCount: int(o.guildCount),
      bannersThisSeason: int(o.bannersThisSeason),
      seasonSupply: big(o.seasonSupply),
      guildThisSeason: int(o.guildThisSeason),
      guildNextSeason: int(o.guildNextSeason),
      suppliedThisSeason: big(o.suppliedThisSeason),
      decorationsThisSeason: int(o.decorationsThisSeason),
      deedsOwned: int(o.deedsOwned),
      sqkBalance: big(o.sqkBalance),
      sqbBalance: big(o.sqbBalance),
      sqkAllowance: big(o.sqkAllowance),
      sqbAllowance: big(o.sqbAllowance),
    };
  }

  /** Every sold deed, read a hundred at a time. */
  async deeds(sold: number): Promise<Deed[]> {
    const out: Deed[] = [];
    for (let first = 1; first <= sold; first += 100) {
      const rows = (await this.read(this.config.shop, S.deedsInRange, [first, 100])) as Row[];
      rows.forEach((row, i) => out.push({ id: first + i, owner: row.owner as Hex, level: int(row.level), name: String(row.name) }));
      if (!rows.length) break;
    }
    return out;
  }

  /** Every guild with its members and supplies in `season`. */
  async guilds(count: number, season: number): Promise<GuildRow[]> {
    const out: GuildRow[] = [];
    for (let first = 1; first <= count; first += 50) {
      const rows = (await this.read(this.config.shop, S.guildsInRange, [first, 50, season])) as Row[];
      for (const row of rows) {
        out.push({
          id: int(row.id),
          founder: row.founder as Hex,
          foundedSeason: int(row.foundedSeason),
          flag: int(row.flag),
          perk: int(row.perk),
          name: String(row.name),
          members: int(row.members),
          supply: big(row.supply),
        });
      }
      if (!rows.length) break;
    }
    return out;
  }

  /** Decoration bits for seasons 1 to `season`, oldest first. */
  async decorationHistory(who: Hex, season: number): Promise<number[]> {
    if (season < 1) return [];
    const bits = (await this.read(this.config.shop, S.decorationHistory, [who, 1, season])) as bigint[];
    return bits.map((b) => Number(b));
  }

  async seasonSupply(season: number): Promise<bigint> {
    return (await this.read(this.config.shop, S.seasonSupply, [season])) as bigint;
  }

  async faucetStatus(who: Hex): Promise<FaucetStatus | null> {
    if (!this.config.faucet) return null;
    const [amount, wait, limit, left, nextAt, held] = (await this.read(this.config.faucet, F.status, [who])) as bigint[];
    return { amount, wait: Number(wait), limit, left, nextAt: Number(nextAt), held };
  }

  // ---- Transactions ------------------------------------------------------------

  tx = {
    stake: (amount: bigint): TxRequest => ({ to: this.config.minter, data: encodeCall(M.stake, [amount]) }),
    unstake: (amount: bigint): TxRequest => ({ to: this.config.minter, data: encodeCall(M.unstake, [amount]) }),
    claim: (): TxRequest => ({ to: this.config.minter, data: encodeCall(M.claim) }),
    sync: (): TxRequest => ({ to: this.config.minter, data: encodeCall(M.sync) }),
    drip: (): TxRequest => ({ to: this.config.faucet!, data: encodeCall(F.drip) }),
    nameDeed: (deed: number, name: string): TxRequest => ({ to: this.config.shop, data: encodeCall(S.nameDeed, [deed, name]) }),
    joinGuild: (guild: number, season: number): TxRequest => ({ to: this.config.shop, data: encodeCall(S.joinGuild, [guild, season]) }),
  };

  /** The payments behind each purchase: what to approve, and the call with and without a permit. */
  pay = {
    stake: (amount: bigint): Payment => ({
      token: this.config.sqk,
      spender: this.config.minter,
      amount,
      plain: { to: this.config.minter, data: encodeCall(M.stake, [amount]) },
      permitted: (p) => ({ to: this.config.minter, data: encodeCall(M.stakeWithPermit, [amount, p.deadline, p.v, p.r, p.s]) }),
    }),
    buyDeed: (maxPrice: bigint): Payment => ({
      token: this.config.sqk,
      spender: this.config.shop,
      amount: maxPrice,
      plain: { to: this.config.shop, data: encodeCall(S.buyDeed, [maxPrice]) },
      permitted: (p) => ({ to: this.config.shop, data: encodeCall(S.buyDeedWithPermit, [maxPrice, p.deadline, p.v, p.r, p.s]) }),
    }),
    foundGuild: (price: bigint, name: string, flag: number, perk: number, joinSeason: number): Payment => ({
      token: this.config.sqk,
      spender: this.config.shop,
      amount: price,
      plain: { to: this.config.shop, data: encodeCall(S.foundGuild, [name, flag, perk, joinSeason]) },
      permitted: (p) => ({ to: this.config.shop, data: encodeCall(S.foundGuildWithPermit, [name, flag, perk, joinSeason, p.deadline, p.v, p.r, p.s]) }),
    }),
    renovate: (price: bigint, deed: number): Payment => ({
      token: this.config.sqb,
      spender: this.config.shop,
      amount: price,
      plain: { to: this.config.shop, data: encodeCall(S.renovate, [deed]) },
      permitted: (p) => ({ to: this.config.shop, data: encodeCall(S.renovateWithPermit, [deed, price, p.deadline, p.v, p.r, p.s]) }),
    }),
    supply: (amount: bigint): Payment => ({
      token: this.config.sqb,
      spender: this.config.shop,
      amount,
      plain: { to: this.config.shop, data: encodeCall(S.supply, [amount]) },
      permitted: (p) => ({ to: this.config.shop, data: encodeCall(S.supplyWithPermit, [amount, p.deadline, p.v, p.r, p.s]) }),
    }),
    decoration: (price: bigint, index: number): Payment => ({
      token: this.config.sqb,
      spender: this.config.shop,
      amount: price,
      plain: { to: this.config.shop, data: encodeCall(S.buyDecoration, [index]) },
      permitted: (p) => ({ to: this.config.shop, data: encodeCall(S.buyDecorationWithPermit, [index, p.deadline, p.v, p.r, p.s]) }),
    }),
  };

  async allowance(token: Hex, owner: Hex, spender: Hex): Promise<bigint> {
    return (await this.read(token, T.allowance, [owner, spender])) as bigint;
  }

  approve(token: Hex, spender: Hex, amount: bigint): TxRequest {
    return { to: token, data: encodeCall(T.approve, [spender, amount]) };
  }

  /** The EIP-712 permit for `payment`, ready for the wallet to sign. */
  async permitData(payment: Payment, owner: Hex, deadline: number): Promise<TypedData> {
    const [domain, nonce] = await Promise.all([this.read(payment.token, T.eip712Domain) as Promise<unknown[]>, this.read(payment.token, T.nonces, [owner]) as Promise<bigint>]);
    const [, name, version, chainId, verifyingContract] = domain as [string, string, string, bigint, Hex];
    return {
      types: {
        EIP712Domain: [
          { name: "name", type: "string" },
          { name: "version", type: "string" },
          { name: "chainId", type: "uint256" },
          { name: "verifyingContract", type: "address" },
        ],
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      primaryType: "Permit",
      domain: { name, version, chainId: Number(chainId), verifyingContract },
      message: { owner, spender: payment.spender, value: payment.amount.toString(), nonce: nonce.toString(), deadline: String(deadline) },
    };
  }
}

export interface Permit {
  deadline: number;
  v: number;
  r: Hex;
  s: Hex;
}

export interface Payment {
  token: Hex;
  spender: Hex;
  amount: bigint;
  plain: TxRequest;
  permitted(permit: Permit): TxRequest;
}

export type PayStep = "approve" | "sign" | "send";

/**
 * The transactions that make a payment, in order. Uses a permit when the
 * wallet signs one, falls back to an approval when it can't, and skips both
 * when the allowance is already there.
 */
export async function planPayment(
  chain: GameChain,
  wallet: WalletSession,
  payment: Payment,
  options: { allowance?: bigint; now?: number; onStep?: (step: PayStep) => void } = {},
): Promise<TxRequest[]> {
  const owner = wallet.account!;
  const allowance = options.allowance ?? (await chain.allowance(payment.token, owner, payment.spender));
  if (allowance >= payment.amount) return [payment.plain];
  // The permit's deadline counts from the chain's clock, so a computer whose clock is off can't make it expire early.
  const now = options.now !== undefined ? Math.floor(options.now / 1000) : await chain.reader.blockTime().catch(() => Math.floor(Date.now() / 1000));
  const deadline = now + 30 * 60;
  try {
    options.onStep?.("sign");
    const signature = await wallet.signTypedData(await chain.permitData(payment, owner, deadline));
    return [payment.permitted({ deadline, ...splitSignature(signature) })];
  } catch (error) {
    // A player who says no means no; a wallet that can't sign permits gets the approval route.
    if (isRejection(error)) throw error;
    options.onStep?.("approve");
    return [chain.approve(payment.token, payment.spender, payment.amount), payment.plain];
  }
}
