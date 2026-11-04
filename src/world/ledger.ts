import type { Gap, LedgerEntry, Turn } from "./types";

// Turns come from the public event feed, GET /v1/events?category=protocol:
// every SqueekCore BatchSettled becomes one `system.settlement_completed`
// event once it has 12 confirmations, including batches with no work. The
// feed is validated strictly; anything malformed is rejected, never guessed.

export const SEPOLIA = "11155111";
const DECIMAL = /^(0|[1-9][0-9]*)$/;
const HEX = /^0x[0-9a-fA-F]+$/;

export class FeedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeedError";
  }
}

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => value !== null && typeof value === "object" && !Array.isArray(value);

function num(value: unknown, path: string): number {
  if (typeof value !== "string" || !DECIMAL.test(value)) throw new FeedError(`${path}: expected a decimal string`);
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new FeedError(`${path}: out of range`);
  return n;
}

function hex(value: unknown, path: string): string {
  if (typeof value !== "string" || !HEX.test(value)) throw new FeedError(`${path}: expected a hex string`);
  return value.toLowerCase();
}

/** One feed event as a turn, or null when it is some other kind of event. */
export function parseSettlement(event: unknown): Turn | null {
  if (!isObject(event)) throw new FeedError("event: expected an object");
  if (event.type !== "system.settlement_completed") return null;
  const id = event.id;
  if (typeof id !== "string" || !id) throw new FeedError("event.id: expected a string");
  const source = event.source;
  const payload = event.payload;
  if (!isObject(source) || !isObject(payload)) throw new FeedError("event: missing source or payload");
  if (source.kind !== "chain" || source.chainId !== SEPOLIA) throw new FeedError("event.source: not a Sepolia chain event");
  if (source.confirmationStatus !== "safe") throw new FeedError("event.source: not yet safe");
  const previous = num(payload.previousSettledThroughRound, "payload.previousSettledThroughRound");
  const to = num(payload.settledThroughRound, "payload.settledThroughRound");
  if (to <= previous) throw new FeedError("payload: empty round range");
  const at = typeof event.occurredAt === "string" ? Date.parse(event.occurredAt) : NaN;
  if (!Number.isFinite(at)) throw new FeedError("event.occurredAt: expected a timestamp");
  const blockHash = hex(source.blockHash, "source.blockHash");
  const tx = hex(source.transactionHash, "source.transactionHash");
  const logIndex = num(source.logIndex, "source.logIndex");
  return {
    kind: "turn",
    id,
    from: previous + 1,
    to,
    active: num(payload.activeRoundCount, "payload.activeRoundCount"),
    work: num(payload.workAdded, "payload.workAdded"),
    blocks: num(payload.completedBlockCount, "payload.completedBlockCount"),
    height: num(payload.blockHeight, "payload.blockHeight"),
    at,
    tx,
    seed: `${blockHash}:${tx}:${logIndex}`,
  };
}

export interface EventsPage {
  installationId: string;
  turns: Turn[];
  nextCursor: string | null;
  /** The oldest event time on the page, for paging back through the feed. */
  oldestAt: number | null;
  events: Json[];
}

/** Validates an /v1/events response (schemaVersion 3). */
export function parseEventsPage(body: unknown): EventsPage {
  if (!isObject(body)) throw new FeedError("response: expected an object");
  if (body.schemaVersion !== 3) throw new FeedError(`unsupported events schemaVersion ${String(body.schemaVersion)}`);
  if (body.status !== "available") throw new FeedError(`events unavailable: ${String(body.reason ?? "unknown")}`);
  const chain = body.chain;
  if (!isObject(chain) || chain.chainId !== SEPOLIA) throw new FeedError("events: not the Sepolia deployment");
  if (typeof body.installationId !== "string" || !body.installationId) throw new FeedError("events: missing installationId");
  if (!Array.isArray(body.events)) throw new FeedError("events: expected a list");
  const turns: Turn[] = [];
  let oldestAt: number | null = null;
  for (const event of body.events) {
    const turn = parseSettlement(event);
    if (turn) turns.push(turn);
    if (isObject(event) && typeof event.occurredAt === "string") {
      const at = Date.parse(event.occurredAt);
      if (Number.isFinite(at)) oldestAt = oldestAt === null ? at : Math.min(oldestAt, at);
    }
  }
  const cursor = body.nextCursor;
  return {
    installationId: body.installationId,
    turns,
    nextCursor: typeof cursor === "string" && cursor ? cursor : null,
    oldestAt,
    events: body.events.filter(isObject),
  };
}

export interface MergeResult {
  entries: LedgerEntry[];
  changed: boolean;
  /** A turn already applied was replaced: the chain reorganised under it. */
  reorg: boolean;
}

const lastTo = (entries: readonly LedgerEntry[], baseFrontier: number) =>
  entries.length ? entries[entries.length - 1].to : baseFrontier;

function gap(from: number, to: number, at: number): Gap {
  return { kind: "gap", id: `gap:${from}-${to}`, from, to, at };
}

/**
 * Adds freshly read turns to the ledger. Turns already there are skipped by id;
 * a different settlement for a range already applied (a reorg) replaces it and
 * everything after it, so replaying gives each round exactly once. Rounds the
 * feed could no longer reach become a gap that gives nothing.
 */
export function mergeTurns(
  current: readonly LedgerEntry[],
  baseFrontier: number,
  incoming: readonly Turn[],
): MergeResult {
  let entries = [...current];
  let changed = false;
  let reorg = false;
  const sorted = [...new Map(incoming.map((t) => [t.id, t])).values()].sort((a, b) => a.to - b.to || a.from - b.from);
  for (const turn of sorted) {
    if (turn.to <= baseFrontier) continue;
    const end = lastTo(entries, baseFrontier);
    if (turn.to <= end) {
      const index = entries.findIndex((e) => e.from <= turn.to && turn.to <= e.to);
      if (index < 0) continue;
      const existing = entries[index];
      if (existing.kind === "gap") continue;
      if (existing.id === turn.id && existing.from === turn.from && existing.to === turn.to) continue;
      // Another settlement now covers these rounds: drop what was built on the old one.
      entries = entries.slice(0, index);
      reorg = true;
      changed = true;
    }
    const tail = lastTo(entries, baseFrontier);
    if (turn.from <= tail) {
      const cut = entries.findIndex((e) => e.to >= turn.from);
      if (cut >= 0 && entries.slice(cut).every((e) => e.kind === "turn")) {
        entries = entries.slice(0, cut);
        reorg = true;
        changed = true;
      }
      if (turn.from <= lastTo(entries, baseFrontier)) continue;
    }
    const start = lastTo(entries, baseFrontier) + 1;
    if (turn.from > start) {
      // Older settlements we could not read: either the feed did not reach that
      // far back, or (in theory) it skipped them. Either way they give nothing.
      entries.push(gap(start, turn.from - 1, turn.at));
    }
    entries.push(turn);
    changed = true;
  }
  return { entries, changed, reorg };
}
