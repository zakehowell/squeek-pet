import { replay } from "./engine";
import type { ChoiceRecord, LedgerEntry, WorldState } from "./types";

// Saves live in local storage on this device only. A save is the founding
// world (or a later checkpoint of it), the settled turns after it and the
// player's choices; the world on screen is always replayed from those, so
// a corrupted or edited number can't silently become progress.

export type WorldKind = "real" | "sim";

export interface SaveFile {
  v: 1;
  kind: WorldKind;
  installation: string | null;
  base: WorldState;
  entries: LedgerEntry[];
  choices: ChoiceRecord[];
  seq: number;
  updated: number;
}

export const SAVE_KEYS: Record<WorldKind, string> = {
  real: "squeek-world:real:v1",
  sim: "squeek-world:sim:v1",
};

/** Entries kept unfolded; older ones are folded into the base checkpoint. */
const KEEP = 1200;
const PRUNE_AT = 2400;

export type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function safeStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function looksLikeSave(value: unknown, kind: WorldKind): value is SaveFile {
  if (!value || typeof value !== "object") return false;
  const save = value as Partial<SaveFile>;
  return (
    save.v === 1 &&
    save.kind === kind &&
    !!save.base &&
    typeof save.base === "object" &&
    save.base.v === 1 &&
    Array.isArray(save.entries) &&
    Array.isArray(save.choices) &&
    typeof save.seq === "number"
  );
}

export function loadSave(kind: WorldKind, storage: StorageLike | null = safeStorage()): SaveFile | null {
  try {
    const text = storage?.getItem(SAVE_KEYS[kind]);
    if (!text) return null;
    const parsed: unknown = JSON.parse(text);
    if (looksLikeSave(parsed, kind)) return parsed;
    storage?.setItem(`${SAVE_KEYS[kind]}:unreadable`, text);
    return null;
  } catch {
    return null;
  }
}

export function writeSave(save: SaveFile, storage: StorageLike | null = safeStorage()): boolean {
  try {
    storage?.setItem(SAVE_KEYS[save.kind], JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

/** Folds old entries into the base so the save stays small. The replayed world is unchanged. */
export function prune(save: SaveFile): SaveFile {
  if (save.entries.length <= PRUNE_AT) return save;
  const cut = save.entries.length - KEEP;
  const old = save.entries.slice(0, cut);
  const sorted = [...save.choices].sort((a, b) => a.seq - b.seq);
  // Fold exactly the choices replay would apply before the first kept entry.
  const firstKept = save.entries[cut];
  let used = 0;
  while (used < sorted.length && sorted[used].at < firstKept.from && sorted[used].at < old[old.length - 1].from) used++;
  const base = replay(save.base, old, sorted.slice(0, used));
  return { ...save, base, entries: save.entries.slice(cut), choices: sorted.slice(used) };
}

/** The world as the player sees it. */
export function worldOf(save: SaveFile): WorldState {
  return replay(save.base, save.entries, save.choices);
}

export function exportSave(save: SaveFile): string {
  return JSON.stringify(save, null, 1);
}

export function importSave(text: string, kind: WorldKind): SaveFile | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return looksLikeSave(parsed, kind) ? parsed : null;
  } catch {
    return null;
  }
}
