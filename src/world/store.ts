import { replay } from "./engine";
import type { ChoiceRecord, LedgerEntry, WorldState } from "./types";

// Saves live in local storage on this device only. A save is the founding
// world (or a later checkpoint of it), the settled turns after it and the
// player's choices; the world on screen is always replayed from those, so
// a corrupted or edited number can't silently become progress. Once the World
// is on-chain, each wallet address has its own real world in this browser.

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
  /** The wallet address this real world belongs to (lowercase), if any. */
  owner?: string;
}

export const SAVE_KEYS: Record<WorldKind, string> = {
  real: "squeek-world:real:v1",
  sim: "squeek-world:sim:v1",
};

/** Marks the save made before wallets as taken over by the first wallet connected here. */
export const ADOPTED_KEY = `${SAVE_KEYS.real}:adopted`;

/** Where a save lives: one real world per wallet address, one without a wallet, one trial. */
export function saveKey(kind: WorldKind, owner?: string | null): string {
  return kind === "real" && owner ? `${SAVE_KEYS.real}:${owner.toLowerCase()}` : SAVE_KEYS[kind];
}

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

function looksLikeSave(value: unknown, kind: WorldKind, owner?: string | null): value is SaveFile {
  if (!value || typeof value !== "object") return false;
  const save = value as Partial<SaveFile>;
  return (
    save.v === 1 &&
    save.kind === kind &&
    (owner ? save.owner === owner.toLowerCase() : save.owner === undefined) &&
    !!save.base &&
    typeof save.base === "object" &&
    save.base.v === 1 &&
    Array.isArray(save.entries) &&
    Array.isArray(save.choices) &&
    typeof save.seq === "number"
  );
}

export function loadSave(kind: WorldKind, storage: StorageLike | null = safeStorage(), owner?: string | null): SaveFile | null {
  const key = saveKey(kind, owner);
  try {
    const text = storage?.getItem(key);
    if (!text) return null;
    const parsed: unknown = JSON.parse(text);
    if (looksLikeSave(parsed, kind, owner)) return parsed;
    storage?.setItem(`${key}:unreadable`, text);
    return null;
  } catch {
    return null;
  }
}

export function writeSave(save: SaveFile, storage: StorageLike | null = safeStorage()): boolean {
  try {
    storage?.setItem(saveKey(save.kind, save.owner), JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

/**
 * The real world of `owner`. The first wallet connected in this browser takes
 * over the world played here before wallets; that save stays where it was too.
 */
export function adoptLegacySave(owner: string, storage: StorageLike | null = safeStorage()): SaveFile | null {
  const own = loadSave("real", storage, owner);
  if (own) return own;
  try {
    if (storage?.getItem(ADOPTED_KEY)) return null;
  } catch {
    return null;
  }
  const legacy = loadSave("real", storage);
  if (!legacy) return null;
  const adopted: SaveFile = { ...legacy, owner: owner.toLowerCase() };
  if (!writeSave(adopted, storage)) return null;
  try {
    storage?.setItem(ADOPTED_KEY, owner.toLowerCase());
  } catch {
    // The copy is written; at worst a second wallet could take it over too.
  }
  return adopted;
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

/** A save pasted in, moved into `owner`'s slot (a real world can come from another wallet or none). */
export function importSave(text: string, kind: WorldKind, owner?: string | null): SaveFile | null {
  try {
    const parsed = JSON.parse(text) as Partial<SaveFile> | null;
    if (!parsed || typeof parsed !== "object") return null;
    const { owner: _from, ...rest } = parsed;
    const moved = kind === "real" && owner ? { ...rest, owner: owner.toLowerCase() } : rest;
    return looksLikeSave(moved, kind, kind === "real" ? owner : null) ? moved : null;
  } catch {
    return null;
  }
}
