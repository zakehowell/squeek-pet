import type { BossSpec } from "./data";
import type { CommunityRead, WeekBucket } from "./feed";
import { bossOf, seasonEnd, seasonStart } from "./season";
import type { LedgerEntry } from "./types";

// The weekly boss is shared: its hit points fall with the real hamster's
// settled work this season, plus real community activity on Squeekchain and
// the hamster's milestones. Everyone reads the same public data, so everyone
// sees the same boss without any server of ours.

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
  /** False when some community pages could not be read. */
  complete: boolean;
  damage: number | null;
  left: number | null;
  defeated: boolean | null;
  simulated: boolean;
}

export function hamsterDamage(buckets: readonly WeekBucket[], season: number): number {
  const start = seasonStart(season);
  const end = seasonEnd(season);
  return buckets.filter((b) => b.startAt >= start && b.startAt < end).reduce((sum, b) => sum + b.work, 0);
}

export function sharedBoss(
  season: number,
  week: readonly WeekBucket[] | null,
  players: CommunityRead | null,
  milestones: CommunityRead | null,
): SharedBoss {
  const boss = bossOf(season);
  const start = seasonStart(season);
  const end = seasonEnd(season);
  const inSeason = (at: number) => at >= start && at < end;
  const hamster = week ? hamsterDamage(week, season) : null;
  const playerEvents = players?.events.filter((e) => inSeason(e.at)) ?? [];
  const milestoneEvents = milestones?.events.filter((e) => inSeason(e.at)) ?? [];
  const community = players ? playerEvents.reduce((sum, e) => sum + e.damage, 0) : null;
  const crit = milestones ? milestoneEvents.reduce((sum, e) => sum + e.damage, 0) : null;
  const damage = hamster === null ? null : hamster + (community ?? 0) + (crit ?? 0);
  return {
    season,
    boss,
    start,
    end,
    hamster,
    community,
    milestones: crit,
    communityCount: playerEvents.length,
    milestoneCount: milestoneEvents.length,
    complete: (players?.complete ?? false) && (milestones?.complete ?? false),
    damage,
    left: damage === null ? null : Math.max(0, boss.hp - damage),
    defeated: damage === null ? null : damage >= boss.hp,
    simulated: false,
  };
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
    complete: true,
    damage: hamster,
    left: Math.max(0, boss.hp - hamster),
    defeated: hamster >= boss.hp,
    simulated: true,
  };
}
