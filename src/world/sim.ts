import { newWorld } from "./engine";
import { rng } from "./rng";
import { loadSave, prune, writeSave, type SaveFile, type StorageLike, safeStorage } from "./store";
import type { Turn } from "./types";

// The trial world: the same rules on made-up turns, so anyone can try a whole
// loop in a minute without waiting for the real hamster. It has its own save,
// every turn is marked simulated, and it never touches the real world.

const ROUND_MS = 600_000;

export function newSim(now: number): SaveFile {
  return { v: 1, kind: "sim", installation: null, base: newWorld(0, now, true), entries: [], choices: [], seq: 0, updated: now };
}

export function loadSim(storage: StorageLike | null = safeStorage(), now = Date.now()): SaveFile {
  const save = loadSave("sim", storage);
  if (save) return save;
  const fresh = newSim(now);
  writeSave(fresh, storage);
  return fresh;
}

/** Made-up settlements: busy rounds give 150 to 600 work, resting rounds none. */
export function simTurns(save: SaveFile, kind: "active" | "rest", count: number): Turn[] {
  const last = save.entries[save.entries.length - 1];
  let to = last ? last.to : save.base.frontier;
  let at = last ? last.at : save.base.created;
  const turns: Turn[] = [];
  for (let i = 0; i < count; i++) {
    to += 1;
    at += ROUND_MS;
    const seed = `sim:${save.base.created}:${to}`;
    const r = rng(seed);
    const work = kind === "active" ? r.int(150, 600) : 0;
    turns.push({
      kind: "turn",
      id: `sim:${to}`,
      from: to,
      to,
      active: kind === "active" ? 1 : 0,
      work,
      blocks: Math.floor(work / 10),
      height: 0,
      at,
      tx: "",
      seed,
      sim: true,
    });
  }
  return turns;
}

export function addSimTurns(kind: "active" | "rest", count: number, storage: StorageLike | null = safeStorage(), now = Date.now()): SaveFile {
  const save = loadSim(storage, now);
  const next = prune({ ...save, entries: [...save.entries, ...simTurns(save, kind, count)], updated: now });
  writeSave(next, storage);
  return next;
}

/** A day of the real hamster's rhythm: about a fifth of the rounds busy. */
export function addSimDay(storage: StorageLike | null = safeStorage(), now = Date.now()): SaveFile {
  let save = loadSim(storage, now);
  const r = rng(`sim-day:${save.entries.length}:${save.base.created}`);
  const turns: Turn[] = [];
  for (let i = 0; i < 144; i++) {
    const draft = { ...save, entries: [...save.entries, ...turns] };
    const busy = (i >= 50 && i < 80 && r.chance(80)) || r.chance(4);
    turns.push(...simTurns(draft, busy ? "active" : "rest", 1));
  }
  save = prune({ ...save, entries: [...save.entries, ...turns], updated: now });
  writeSave(save, storage);
  return save;
}

export function resetSim(storage: StorageLike | null = safeStorage(), now = Date.now()): SaveFile {
  const fresh = newSim(now);
  writeSave(fresh, storage);
  return fresh;
}
