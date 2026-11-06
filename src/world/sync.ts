import { clockOf, newWorld, replay } from "./engine";
import { readSettlements, type FetchLike, defaultFetch } from "./feed";
import { mergeTurns } from "./ledger";
import { loadSave, prune, writeSave, type SaveFile, type StorageLike, safeStorage } from "./store";
import type { Choice, ChoiceRecord, Turn } from "./types";

// Keeps the real world's save in step with the chain. Every open World tab
// calls `pull`; merging is idempotent, so it does not matter which one gets
// there first.

export interface PullResult {
  save: SaveFile;
  changed: boolean;
  added: Turn[];
  founded: boolean;
  reorg: boolean;
}

/**
 * How far back a reopened world catches up: about two weeks of settlements
 * (some 140 a day, two protocol events each, 100 events a page). The World is
 * a web page now, so nothing keeps it in step while no tab is open.
 */
export const CATCH_UP_PAGES = 40;

export function foundWorld(origin: number, installation: string, now: number, owner?: string | null): SaveFile {
  const save: SaveFile = { v: 1, kind: "real", installation, base: newWorld(origin, now), entries: [], choices: [], seq: 0, updated: now };
  return owner ? { ...save, owner: owner.toLowerCase() } : save;
}

export async function pull(
  options: { fetchImpl?: FetchLike; storage?: StorageLike | null; now?: number; pause?: (ms: number) => Promise<void>; owner?: string | null } = {},
): Promise<PullResult> {
  const fetchImpl = options.fetchImpl ?? defaultFetch;
  const storage = options.storage === undefined ? safeStorage() : options.storage;
  const now = options.now ?? Date.now();
  const owner = options.owner ?? null;
  const existing = loadSave("real", storage, owner);
  const after = existing ? (existing.entries.length ? existing.entries[existing.entries.length - 1].to : existing.base.frontier) : null;
  const read = await readSettlements(fetchImpl, after, CATCH_UP_PAGES, options.pause);

  // Re-read just before writing: another tab may have saved meanwhile.
  let save = loadSave("real", storage, owner) ?? existing;
  if (!save) {
    const origin = read.newest?.to;
    if (origin === undefined) throw new Error("No settlement found to found the world on");
    save = foundWorld(origin, read.installationId, now, owner);
    writeSave(save, storage);
    return { save, changed: true, added: [], founded: true, reorg: false };
  }

  if (save.installation && read.installationId && save.installation !== read.installationId) {
    // Squeekchain moved to a new deployment and its rounds start over. Keep
    // everything the player has, and continue on the new timeline.
    const world = replay(save.base, save.entries, save.choices);
    const origin = read.newest?.to ?? 0;
    world.frontier = origin;
    world.diary.push({
      id: `reset:${read.installationId}`,
      kind: "gap",
      from: origin,
      to: origin,
      at: now,
      rounds: 0,
      work: 0,
      blocks: 0,
      seed: `reset:${read.installationId}`,
      tx: null,
      lines: [{ k: "d.reset", v: {} }],
    });
    save = { ...save, installation: read.installationId, base: world, entries: [], choices: [], updated: now };
    writeSave(save, storage);
    return { save, changed: true, added: [], founded: false, reorg: true };
  }

  const before = new Set(save.entries.map((e) => e.id));
  const merged = mergeTurns(save.entries, save.base.frontier, read.turns);
  if (!merged.changed) return { save, changed: false, added: [], founded: false, reorg: false };
  save = prune({ ...save, installation: save.installation ?? read.installationId, entries: merged.entries, updated: now });
  writeSave(save, storage);
  const added = merged.entries.filter((e): e is Turn => e.kind === "turn" && !before.has(e.id));
  return { save, changed: true, added, founded: false, reorg: merged.reorg };
}

/** Records a choice in a save after re-reading it, so two windows don't overwrite each other. */
export function recordChoice(kind: SaveFile["kind"], choice: Choice, now = Date.now(), storage: StorageLike | null = safeStorage(), owner?: string | null): SaveFile | null {
  const save = loadSave(kind, storage, owner);
  if (!save) return null;
  const frontier = save.entries.length ? save.entries[save.entries.length - 1].to : save.base.frontier;
  const record: ChoiceRecord = { seq: save.seq + 1, at: frontier, made: now, c: choice };
  const next = { ...save, choices: [...save.choices, record], seq: record.seq, updated: now };
  writeSave(next, storage);
  return next;
}

/** World time used by the rules for a save with no turns yet. */
export function worldClock(save: SaveFile): number {
  const world = save.base;
  const last = save.entries[save.entries.length - 1];
  return Math.max(clockOf(world), last ? last.at : 0);
}

