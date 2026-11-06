// Shapes of Squeek Pet World. The world is a pure function of two logs: the
// settlements SqueekCore recorded on Sepolia (one "turn" each) and the choices
// the player made. Everything is an integer, so a replay always lands on the
// same state on every machine.

export type ResourceId = "beans" | "dew" | "wood" | "stone" | "crystal" | "carrot" | "sunseed" | "berry" | "clover";
export type Resources = Record<ResourceId, number>;

export type PlantId = "carrot" | "sunflower" | "clover" | "blueberry" | "lily" | "moonflower";
export type AreaId = "meadow" | "forest" | "lake" | "hills" | "ruins";
export type BuildingId = "cottage" | "lantern" | "well" | "silo" | "workshop" | "pier" | "windmill" | "observatory";
export type RouteId = "mossy" | "woods" | "mirror" | "chime" | "starfall";
export type GearId = "lamp" | "rope" | "map" | "trowel";
export type ConsumableId = "snack" | "charm";
export type ItemId = GearId | ConsumableId;
export type NpcId = "owl" | "frog" | "mole" | "firefly" | "crow" | "hedgehog";
export type GuildId = "seed" | "lantern" | "cog" | "star";
export type ClassId = "guardian" | "ranger" | "herbalist" | "scout";
export type ActionId = "strike" | "guard" | "support" | "scavenge";
export type StanceId = "fierce" | "shielded" | "drowsy" | "tricky";
export type BossId = "tangerine" | "clockcrow" | "fogserpent" | "frostowl";
export type ForkPath = "safe" | "risky";

/** One SqueekCore settlement (BatchSettled), read from the public event feed. */
export interface Turn {
  kind: "turn";
  /** The feed's stable event id: chain, contract, transaction, log index. */
  id: string;
  /** First and last round this settlement certified. */
  from: number;
  to: number;
  /** Rounds with wheel work; the rest of the rounds were rests. */
  active: number;
  work: number;
  blocks: number;
  height: number;
  /** Block time of the settlement, ms. */
  at: number;
  tx: string;
  /** Randomness for this turn: the block hash, transaction and log index. */
  seed: string;
  /** Simulated turns exist only in the clearly labelled trial world. */
  sim?: boolean;
}

/** Rounds the world could not read back (too long offline); they give nothing. */
export interface Gap {
  kind: "gap";
  id: string;
  from: number;
  to: number;
  at: number;
}

export type LedgerEntry = Turn | Gap;

export type Choice =
  | { t: "plant"; plot: number; plant: PlantId }
  | { t: "harvest"; plot: number }
  | { t: "clear"; plot: number }
  | { t: "build"; building: BuildingId }
  | { t: "unlock"; area: AreaId }
  | { t: "craft"; item: ItemId }
  | { t: "expedition"; route: RouteId; gear: GearId[]; snack: boolean; charm: boolean }
  | { t: "fork"; path: ForkPath }
  | { t: "recall" }
  | { t: "guild"; guild: GuildId; season: number }
  | { t: "class"; cls: ClassId }
  | { t: "action"; action: ActionId }
  | { t: "chest"; season: number; bossDefeated: boolean }
  /** Turns a home deed the player holds on Sepolia into one more bed (once per world). */
  | { t: "deed"; deed: number };

export interface ChoiceRecord {
  /** Order the player made the choices in. */
  seq: number;
  /** The settled frontier (last settled round) when the choice was made. */
  at: number;
  /** Wall clock when it was made; shown only, never used by the rules. */
  made: number;
  c: Choice;
}

export interface Plot {
  area: AreaId;
  plant: PlantId | null;
  growth: number;
  /** The home deed this bed stands on, for the one bed a deed adds. */
  deed?: number;
}

export interface Expedition {
  route: RouteId;
  steps: number;
  /** Next waypoint to reach, 0 to 5. */
  node: number;
  gear: GearId[];
  snack: boolean;
  charm: boolean;
  fork: ForkPath | null;
  found: Partial<Resources>;
  /** First round of the expedition, for the diary. */
  since: number;
}

export interface GuildState {
  guild: GuildId | null;
  /** The season the player joined `guild` for. */
  season: number;
  /** A sign-up for next season, kept apart so this season's guild stays until the week ends. */
  next?: { guild: GuildId; season: number } | null;
  cls: ClassId;
  action: ActionId;
  /** Personal contribution by season number. */
  contribution: Record<number, number>;
  /** Seasons whose chest was opened. */
  chests: number[];
  hits: number;
}

/** One sentence of the diary: a message key plus values, rendered in any language. */
export interface Line {
  k: string;
  v?: Record<string, string | number>;
}

export type DiaryKind = "active" | "rest" | "gap" | "start" | "event";

export interface DiaryEntry {
  id: string;
  kind: DiaryKind;
  from: number;
  to: number;
  at: number;
  rounds: number;
  work: number;
  blocks: number;
  /** Seed of the dream drawn for this entry (the latest turn's). */
  seed: string;
  tx: string | null;
  lines: Line[];
  sim?: boolean;
}

/** Something worth a toast on the World page. */
export interface WorldNews {
  turn: string;
  to: number;
  lines: Line[];
}

export interface WorldStats {
  work: number;
  activeTurns: number;
  restTurns: number;
  restRounds: number;
  harvests: number;
  steps: number;
  builds: number;
  expeditions: number;
  npcs: Partial<Record<NpcId, number>>;
}

export interface WorldState {
  v: 1;
  /** Round the world was founded after. */
  origin: number;
  /** When it was founded, ms. Stands in for the clock until the first turn. */
  created: number;
  /** Last settled round applied. */
  frontier: number;
  /** Block time of the last applied turn, ms (0 before the first). */
  lastAt: number;
  turns: number;
  res: Resources;
  seeds: Record<PlantId, number>;
  items: Record<ItemId, number>;
  plots: Plot[];
  areas: AreaId[];
  buildings: Partial<Record<BuildingId, number>>;
  expedition: Expedition | null;
  routesDone: Partial<Record<RouteId, number>>;
  guild: GuildState;
  diary: DiaryEntry[];
  news: WorldNews[];
  stats: WorldStats;
  /** Work units not yet turned into beans (1 bean per 10). */
  dust: number;
  /** The home deed that added a bed to this world, if any. */
  deed?: number;
}
