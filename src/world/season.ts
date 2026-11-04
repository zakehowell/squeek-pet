import { BOSSES, SEASON_EPOCH, STANCES, WEEK_MS, type BossSpec } from "./data";
import { rng } from "./rng";
import type { StanceId } from "./types";

// Guild seasons are calendar weeks starting Monday 12:00 UTC, the same noon
// Squeekchain's measurement days turn over at. Everyone is in the same season
// at the same time, so everyone faces the same boss.

export function seasonOf(ms: number): number {
  return Math.floor((ms - SEASON_EPOCH) / WEEK_MS) + 1;
}

export function seasonStart(season: number): number {
  return SEASON_EPOCH + (season - 1) * WEEK_MS;
}

export function seasonEnd(season: number): number {
  return seasonStart(season + 1);
}

export function bossOf(season: number): BossSpec {
  const index = (((season - 1) % BOSSES.length) + BOSSES.length) % BOSSES.length;
  return BOSSES[index];
}

/** The boss's mood during one settlement, drawn from that settlement's own hashes. */
export function stanceFor(seed: string, season: number): StanceId {
  const boss = bossOf(season);
  return rng(`${seed}:boss`).weighted(STANCES.map((stance) => ({ weight: boss.moods[stance], value: stance })));
}
