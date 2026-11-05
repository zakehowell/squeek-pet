import { COMMUNITY_SHARE, MILESTONE_SHARE, type BossSpec } from "./data";
import {
  mergeNewer,
  mergeOlder,
  readCommunity,
  readFrom,
  type CommunityCategory,
  type CommunityEvent,
  type CommunityOptions,
  type CommunityRead,
  type FetchLike,
  type WorkBucket,
} from "./feed";
import { bossOf, seasonEnd, seasonStart } from "./season";
import type { LedgerEntry } from "./types";

// The weekly boss is shared: its hit points fall with the real hamster's
// settled work this season, plus real community activity on Squeekchain and
// the hamster's milestones, each capped at a share of the boss's HP. Everyone
// reads the same public data, so everyone sees the same boss without any
// server of ours.

export interface SharedBoss {
  season: number;
  boss: BossSpec;
  start: number;
  end: number;
  /** Damage by source; null while unknown (never shown as zero). */
  hamster: number | null;
  community: number | null;
  milestones: number | null;
  communityCount: number;
  milestoneCount: number;
  communityCap: number;
  milestoneCap: number;
  /** False when some community pages could not be read, so the damage is only a lower bound. */
  complete: boolean;
  damage: number | null;
  left: number | null;
  /** True once the damage reaches the HP, false when the damage is known in full and falls short, null while unknown. */
  defeated: boolean | null;
  simulated: boolean;
}

export const communityCap = (boss: BossSpec) => Math.round(boss.hp * COMMUNITY_SHARE);
export const milestoneCap = (boss: BossSpec) => Math.round(boss.hp * MILESTONE_SHARE);

export function hamsterDamage(buckets: readonly WorkBucket[], season: number): number {
  const start = seasonStart(season);
  const end = seasonEnd(season);
  return buckets.filter((b) => b.startAt >= start && b.startAt < end).reduce((sum, b) => sum + b.work, 0);
}

/** Uncapped damage and count of one season's events, each event counted once. */
export function seasonDamage(events: readonly CommunityEvent[], season: number): { damage: number; count: number } {
  const start = seasonStart(season);
  const end = seasonEnd(season);
  const seen = new Set<string>();
  let damage = 0;
  for (const event of events) {
    if (event.at < start || event.at >= end || seen.has(event.id)) continue;
    seen.add(event.id);
    damage += event.damage;
  }
  return { damage, count: seen.size };
}

/** A read settles a season's capped damage when it covers the whole season or already reaches the cap. */
export function settles(read: CommunityRead | null, season: number, cap: number): boolean {
  if (!read) return false;
  return read.coveredFrom <= seasonStart(season) || seasonDamage(read.events, season).damage >= cap;
}

export function sharedBoss(
  season: number,
  days: readonly WorkBucket[] | null,
  players: CommunityRead | null,
  milestones: CommunityRead | null,
): SharedBoss {
  const boss = bossOf(season);
  const caps = { community: communityCap(boss), milestones: milestoneCap(boss) };
  const hamster = days ? hamsterDamage(days, season) : null;
  const fromPlayers = players ? seasonDamage(players.events, season) : null;
  const fromMilestones = milestones ? seasonDamage(milestones.events, season) : null;
  const community = fromPlayers ? Math.min(caps.community, fromPlayers.damage) : null;
  const crit = fromMilestones ? Math.min(caps.milestones, fromMilestones.damage) : null;
  const damage = hamster === null ? null : hamster + (community ?? 0) + (crit ?? 0);
  const complete = settles(players, season, caps.community) && settles(milestones, season, caps.milestones);
  return {
    season,
    boss,
    start: seasonStart(season),
    end: seasonEnd(season),
    hamster,
    community,
    milestones: crit,
    communityCount: fromPlayers?.count ?? 0,
    milestoneCount: fromMilestones?.count ?? 0,
    communityCap: caps.community,
    milestoneCap: caps.milestones,
    complete,
    damage,
    left: damage === null ? null : Math.max(0, boss.hp - damage),
    defeated: damage === null ? null : damage >= boss.hp ? true : complete ? false : null,
    simulated: false,
  };
}

/** How far before the newest event already read a read for newer events starts, for events that arrive late. */
const OVERLAP_MS = 15 * 60_000;

/**
 * Brings a community read up to date for the seasons the boss needs, newest
 * first: this season, and last season while its chest waits on the result.
 * Paging stops once the oldest season's capped share is settled, so a busy
 * week costs a few pages instead of thousands of events.
 */
export async function refreshCommunity(
  fetchImpl: FetchLike,
  read: CommunityRead | null,
  category: CommunityCategory,
  seasons: readonly number[],
  cap: (season: number) => number,
  options: Pick<CommunityOptions, "pause"> = {},
): Promise<CommunityRead> {
  const current = seasons[0];
  const oldest = seasons[seasons.length - 1];
  const since = seasonStart(oldest);
  const enough = (base: readonly CommunityEvent[]) => (events: readonly CommunityEvent[]) => seasonDamage([...base, ...events], oldest).damage >= cap(oldest);
  if (!read || read.since !== since) return readCommunity(fetchImpl, since, category, { ...options, maxPages: 20, enough: enough([]) });
  let next = read;
  // Newer events, unless this season's share is already full.
  if (seasonDamage(next.events, current).damage < cap(current)) {
    const from = Math.max(since, readFrom(next, since) - OVERLAP_MS);
    next = mergeNewer(next, await readCommunity(fetchImpl, from, category, { ...options, maxPages: 6 }));
  }
  // Older events, while the oldest season is still open.
  if (next.older && !settles(next, oldest, cap(oldest))) {
    const base = next;
    next = mergeOlder(base, await readCommunity(fetchImpl, since, category, { ...options, cursor: base.older, maxPages: 20, enough: enough(base.events) }));
  }
  return next;
}

/** Whether older pages still wait to be read for the oldest season. */
export function backfilling(read: CommunityRead | null, seasons: readonly number[], cap: (season: number) => number): boolean {
  const oldest = seasons[seasons.length - 1];
  return !!read && read.since === seasonStart(oldest) && read.older !== null && !settles(read, oldest, cap(oldest));
}

/** The trial world's boss: only its own simulated work counts. */
export function simulatedBoss(season: number, entries: readonly LedgerEntry[]): SharedBoss {
  const boss = bossOf(season);
  const start = seasonStart(season);
  const end = seasonEnd(season);
  const hamster = entries.reduce((sum, e) => (e.kind === "turn" && e.at >= start && e.at < end ? sum + e.work : sum), 0);
  return {
    season,
    boss,
    start,
    end,
    hamster,
    community: 0,
    milestones: 0,
    communityCount: 0,
    milestoneCount: 0,
    communityCap: 0,
    milestoneCap: 0,
    complete: true,
    damage: hamster,
    left: Math.max(0, boss.hp - hamster),
    defeated: hamster >= boss.hp,
    simulated: true,
  };
}
