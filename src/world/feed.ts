import { COMMUNITY_DAMAGE, MILESTONE_DAMAGE } from "./data";
import { FeedError, SEPOLIA, parseEventsPage, type EventsPage } from "./ledger";
import { digest } from "./rng";
import type { Turn } from "./types";

// Read-only requests to Squeekchain's public API (paths under /v1; the event
// feed is schemaVersion 4 since release core-sepolia-20261103). Plain GETs
// without credentials, so browsers send no CORS preflight.

export const API_BASE = "https://api.squeekchain.com";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export const defaultFetch: FetchLike = (input, init) => fetch(input, init);

export class BusyError extends FeedError {
  constructor(readonly retryAfterMs: number) {
    super(`API busy, retry in ${retryAfterMs} ms`);
    this.name = "BusyError";
  }
}

async function getJson(fetchImpl: FetchLike, path: string): Promise<unknown> {
  const response = await fetchImpl(API_BASE + path, { cache: "no-store", credentials: "omit" });
  if (response.status === 429 || response.status === 503) {
    const seconds = Number(response.headers.get("Retry-After"));
    throw new BusyError(Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 15_000);
  }
  if (!response.ok) throw new FeedError(`HTTP ${response.status} for ${path}`);
  try {
    return await response.json();
  } catch {
    throw new FeedError(`${path}: response was not JSON`);
  }
}

function eventsPath(category: string, limit: number, cursor: string | null) {
  const query = new URLSearchParams({ category, limit: String(limit) });
  if (cursor) query.set("cursor", cursor);
  return `/v1/events?${query.toString()}`;
}

export interface SettlementRead {
  installationId: string;
  release: string;
  turns: Turn[];
  /** The read reached the round after `after` (or `after` was null). */
  reachedBack: boolean;
  newest: Turn | null;
}

/**
 * Reads settlements newer than round `after`, paging back through the feed
 * until it reaches that round or `maxPages` pages have been read.
 */
export async function readSettlements(fetchImpl: FetchLike, after: number | null, maxPages = 12): Promise<SettlementRead> {
  const turns: Turn[] = [];
  let cursor: string | null = null;
  let installationId = "";
  let release = "";
  let reachedBack = after === null;
  for (let page = 0; page < maxPages; page++) {
    const body: EventsPage = parseEventsPage(await getJson(fetchImpl, eventsPath("protocol", page === 0 ? 40 : 100, cursor)));
    if (installationId && body.installationId !== installationId) throw new FeedError("installation changed while paging");
    if (release && body.release !== release) throw new FeedError("release changed while paging");
    installationId = body.installationId;
    release = body.release;
    turns.push(...body.turns);
    const oldest = turns.reduce<number | null>((min, t) => (min === null ? t.from : Math.min(min, t.from)), null);
    if (after === null || (oldest !== null && oldest <= after + 1)) {
      reachedBack = true;
      break;
    }
    cursor = body.nextCursor;
    if (!cursor) {
      reachedBack = true; // the feed has nothing older
      break;
    }
  }
  const newest = turns.reduce<Turn | null>((best, t) => (!best || t.to > best.to ? t : best), null);
  return { installationId, release, turns: after === null ? turns : turns.filter((t) => t.to > after), reachedBack, newest };
}

// ---- Shared boss data (plan D) --------------------------------------------

export interface WorkBucket {
  startAt: number;
  endAt: number;
  work: number;
}

/**
 * The last 30 days of settled work in daily buckets: GET /v1/settlements?range=30d.
 * Days run from 12:00 UTC like the seasons, so a season is exactly seven buckets
 * and last season stays readable after it ends.
 */
export async function readDays(fetchImpl: FetchLike): Promise<WorkBucket[]> {
  const body = await getJson(fetchImpl, "/v1/settlements?range=30d");
  if (!body || typeof body !== "object") throw new FeedError("settlements: expected an object");
  const b = body as Record<string, unknown>;
  if (b.schemaVersion !== 3) throw new FeedError(`unsupported settlements schemaVersion ${String(b.schemaVersion)}`);
  if (b.status !== "available") throw new FeedError(`settlements unavailable: ${String(b.reason ?? "unknown")}`);
  const chain = b.chain as Record<string, unknown> | undefined;
  if (!chain || chain.chainId !== SEPOLIA) throw new FeedError("settlements: not the Sepolia deployment");
  if (!Array.isArray(b.buckets)) throw new FeedError("settlements: expected buckets");
  return b.buckets.map((raw, i) => {
    const bucket = raw as Record<string, unknown>;
    const startAt = Date.parse(String(bucket.startAt));
    const endAt = Date.parse(String(bucket.endAt));
    const work = Number(bucket.workAdded);
    if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || typeof bucket.workAdded !== "string" || !Number.isSafeInteger(work) || work < 0) {
      throw new FeedError(`settlements: bucket ${i} is malformed`);
    }
    return { startAt, endAt, work };
  });
}

export type CommunityCategory = "players" | "measurement";

export interface CommunityEvent {
  /** A digest of the feed's event id: enough to tell events apart, with no addresses or hashes. */
  id: string;
  type: string;
  at: number;
  damage: number;
  /** A small, address-free detail: merge level, milestone distance, streak days, speed. */
  detail: number | null;
}

export interface CommunityRead {
  /** Where the read starts: nothing older is kept. */
  since: number;
  events: CommunityEvent[];
  /** Every event from this time on has been read; older ones may be missing. */
  coveredFrom: number;
  /** The feed cursor for older events, when the read stopped before `since`. */
  older: string | null;
}

function detailOf(type: string, payload: Record<string, unknown>): number | null {
  const pick = (key: string) => (typeof payload[key] === "string" || typeof payload[key] === "number" ? Number(payload[key]) : NaN);
  let value = NaN;
  if (type === "nft.merged") value = pick("level");
  else if (type === "measurement.distance_milestone" || type === "measurement.daily_distance_milestone") value = pick("thresholdDistanceMm");
  else if (type === "measurement.speed_milestone") value = pick("thresholdSpeedMmPerSecond");
  else if (type === "measurement.speed_record") value = pick("recordMmPerSecond");
  else if (type === "measurement.distance_streak") value = pick("days");
  return Number.isFinite(value) ? value : null;
}

export interface CommunityOptions {
  maxPages?: number;
  /** Continue from this cursor, older than everything read so far. */
  cursor?: string | null;
  /** Stops paging once the events read so far settle the answer, e.g. a capped total. */
  enough?: (events: readonly CommunityEvent[]) => boolean;
  /** Waits between pages after the first few, to stay inside the API's rate limit. */
  pause?: (ms: number) => Promise<void>;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Real Squeekchain community activity since `since`, newest first (players:
 * claims, stakes, deposits, merges; measurement: the hamster's milestones).
 * Only the event type, time and a small number are kept; no addresses. Paging
 * stops at `since`, at the end of the feed, after `maxPages` pages, or when
 * `enough` says so. If the API turns busy after the first page, what was read
 * is returned with a cursor to go on from.
 */
export async function readCommunity(fetchImpl: FetchLike, since: number, category: CommunityCategory, options: CommunityOptions = {}): Promise<CommunityRead> {
  const { maxPages = 6, enough, pause = wait } = options;
  const table = category === "players" ? COMMUNITY_DAMAGE : MILESTONE_DAMAGE;
  const events: CommunityEvent[] = [];
  let cursor: string | null = options.cursor ?? null;
  let coveredFrom = Number.POSITIVE_INFINITY;
  for (let page = 0; page < maxPages; page++) {
    if (page >= 8) await pause(250);
    let body: EventsPage;
    try {
      body = parseEventsPage(await getJson(fetchImpl, eventsPath(category, 100, cursor)));
    } catch (error) {
      if (page > 0 && error instanceof BusyError) return { since, events, coveredFrom, older: cursor };
      throw error;
    }
    for (const event of body.events) {
      const type = String(event.type);
      const at = Date.parse(String(event.occurredAt));
      if (!Number.isFinite(at) || at < since) continue;
      const damage = table[type];
      if (!damage) continue;
      const payload = (event.payload && typeof event.payload === "object" ? event.payload : {}) as Record<string, unknown>;
      events.push({ id: digest(String(event.id)), type, at, damage, detail: detailOf(type, payload) });
    }
    if (body.oldestAt === null || body.oldestAt < since || !body.nextCursor) return { since, events, coveredFrom: since, older: null };
    // Events that share the page's oldest time may go on to the next page.
    coveredFrom = body.oldestAt + 1;
    cursor = body.nextCursor;
    if (enough?.(events)) break;
  }
  return { since, events, coveredFrom, older: cursor };
}

/** Where the next read for newer events can start: the newest event read, or `since`. */
export function readFrom(read: CommunityRead | null, since: number): number {
  return read && read.events.length ? Math.max(since, ...read.events.map((e) => e.at)) : since;
}

function joinEvents(a: readonly CommunityEvent[], b: readonly CommunityEvent[], since: number): CommunityEvent[] {
  const byId = new Map<string, CommunityEvent>();
  for (const event of [...a, ...b]) if (event.at >= since) byId.set(event.id, event);
  return [...byId.values()].sort((x, y) => x.at - y.at);
}

/**
 * Adds a read of newer events (started at or before `readFrom(older)`) to an
 * older read, keeping the older read's `since`. When the newer read reached
 * back to the older one, the two cover one stretch; otherwise only the newer
 * stretch counts as covered, and the older cursor goes on from the gap.
 */
export function mergeNewer(older: CommunityRead | null, newer: CommunityRead): CommunityRead {
  if (!older) return newer;
  const since = older.since;
  const joined = newer.coveredFrom <= readFrom(older, since);
  return {
    since,
    events: joinEvents(older.events, newer.events, since),
    coveredFrom: Math.max(since, joined ? Math.min(older.coveredFrom, newer.coveredFrom) : newer.coveredFrom),
    older: joined ? older.older : newer.older,
  };
}

/** Adds a read that went on from `read.older` to the read it continues. */
export function mergeOlder(read: CommunityRead, more: CommunityRead): CommunityRead {
  return { since: read.since, events: joinEvents(read.events, more.events, read.since), coveredFrom: Math.max(read.since, Math.min(read.coveredFrom, more.coveredFrom)), older: more.older };
}
