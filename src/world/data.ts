import type {
  ActionId,
  AreaId,
  BossId,
  BuildingId,
  ClassId,
  ConsumableId,
  GearId,
  GuildId,
  ItemId,
  NpcId,
  PlantId,
  ResourceId,
  Resources,
  RouteId,
  StanceId,
} from "./types";

// The rules of the world as data. Numbers are tuned to the real hamster:
// about 10,000 work units a day, mostly in 20 to 30 busy ten-minute rounds at
// night (Beijing daytime), and about 120 resting rounds.

export interface Name {
  en: string;
  zh: string;
}

const n = (en: string, zh: string): Name => ({ en, zh });

export const RESOURCES: readonly ResourceId[] = ["beans", "dew", "wood", "stone", "crystal", "carrot", "sunseed", "berry", "clover"];

export const RESOURCE_NAMES: Record<ResourceId, Name> = {
  beans: n("Data beans", "数据豆"),
  dew: n("Dream dew", "梦露"),
  wood: n("Wood", "木材"),
  stone: n("Pebbles", "石子"),
  crystal: n("Star crystals", "星晶"),
  carrot: n("Carrots", "胡萝卜"),
  sunseed: n("Sunflower seeds", "葵花籽"),
  berry: n("Blueberries", "蓝莓"),
  clover: n("Lucky clovers", "幸运草"),
};

export type Cost = Partial<Resources>;

export const emptyResources = (): Resources => ({
  beans: 0,
  dew: 0,
  wood: 0,
  stone: 0,
  crystal: 0,
  carrot: 0,
  sunseed: 0,
  berry: 0,
  clover: 0,
});

// ---- A. Home: areas, plants, buildings --------------------------------------

export interface AreaSpec {
  id: AreaId;
  name: Name;
  blurb: Name;
  cost: Cost;
  plots: number;
}

export const AREAS: readonly AreaSpec[] = [
  { id: "meadow", name: n("Meadow", "草地"), blurb: n("Home: the cottage, the wheel and the first beds.", "家：小屋、跑轮和第一块菜地。"), cost: {}, plots: 3 },
  {
    id: "forest",
    name: n("Forest Edge", "林边"),
    blurb: n("Shady beds for blueberries, the bean silo and the workshop.", "阴凉的菜地适合种蓝莓，还能盖豆仓和工坊。"),
    cost: { beans: 250, wood: 15 },
    plots: 2,
  },
  {
    id: "lake",
    name: n("Lakeside", "湖畔"),
    blurb: n("Water lilies that only grow in dreams, and a little pier.", "只在梦里生长的睡莲，还有一座小码头。"),
    cost: { beans: 500, wood: 25, stone: 20 },
    plots: 2,
  },
  {
    id: "hills",
    name: n("Windy Hills", "风铃山丘"),
    blurb: n("A windmill that spins with the real wheel.", "风车会跟着真实跑轮一起转。"),
    cost: { beans: 900, stone: 40, crystal: 3 },
    plots: 2,
  },
  {
    id: "ruins",
    name: n("Starlight Ruins", "星光遗迹"),
    blurb: n("Moonflowers and an observatory that reads the boss's moods.", "月光花，以及能看穿 Boss 心情的观星台。"),
    cost: { beans: 1500, dew: 60, crystal: 8 },
    plots: 2,
  },
];

export const AREA_ORDER: readonly AreaId[] = AREAS.map((a) => a.id);
export const areaSpec = (id: AreaId) => AREAS.find((a) => a.id === id)!;

export type GrowsOn = "work" | "rest" | "both";

export interface PlantSpec {
  id: PlantId;
  name: Name;
  /** Growth points needed to ripen. Work adds 1 per unit; each resting round adds REST_GROWTH. */
  need: number;
  grows: GrowsOn;
  /** Where it may be planted; null means any unlocked bed. */
  area: AreaId | null;
  /** The seed it is planted from: a seed packet, or a resource. */
  seedFrom: "packet" | ResourceId;
  yields: Cost;
  seedBack: number;
  blurb: Name;
}

export const REST_GROWTH = 15;
export const WELL_REST_BONUS = 5;

export const PLANTS: Record<PlantId, PlantSpec> = {
  carrot: {
    id: "carrot",
    name: n("Carrot", "胡萝卜"),
    need: 700,
    grows: "both",
    area: null,
    seedFrom: "packet",
    yields: { carrot: 3 },
    seedBack: 1,
    blurb: n("Grows by day and by night. Carrots pack expedition snacks.", "白天黑夜都长。胡萝卜能做探险零食。"),
  },
  sunflower: {
    id: "sunflower",
    name: n("Sunflower", "向日葵"),
    need: 1200,
    grows: "work",
    area: null,
    seedFrom: "sunseed",
    yields: { sunseed: 4, beans: 30 },
    seedBack: 0,
    blurb: n("Only grows while the real hamster runs. Plant it from sunflower seeds.", "只在真仓鼠跑步时生长，用葵花籽种。"),
  },
  clover: {
    id: "clover",
    name: n("Lucky clover", "幸运草"),
    need: 1000,
    grows: "both",
    area: null,
    seedFrom: "packet",
    yields: { clover: 1 },
    seedBack: 1,
    blurb: n("Solves riddles and makes lucky charms.", "能解谜题，也能做幸运护符。"),
  },
  blueberry: {
    id: "blueberry",
    name: n("Blueberry bush", "蓝莓丛"),
    need: 2000,
    grows: "both",
    area: "forest",
    seedFrom: "packet",
    yields: { berry: 3 },
    seedBack: 1,
    blurb: n("Forest Edge only. Herbalists brew support from berries.", "只能种在林边。药师用蓝莓支援公会。"),
  },
  lily: {
    id: "lily",
    name: n("Water lily", "睡莲"),
    need: 1500,
    grows: "rest",
    area: "lake",
    seedFrom: "packet",
    yields: { crystal: 1, dew: 10 },
    seedBack: 1,
    blurb: n("Lakeside only. Grows only while the hamster rests.", "只能种在湖畔，只在仓鼠休息时生长。"),
  },
  moonflower: {
    id: "moonflower",
    name: n("Moonflower", "月光花"),
    need: 2400,
    grows: "rest",
    area: "ruins",
    seedFrom: "packet",
    yields: { crystal: 2, dew: 30 },
    seedBack: 1,
    blurb: n("Starlight Ruins only. Opens on long nights.", "只能种在星光遗迹，在漫长的夜里开放。"),
  },
};

export const PLANT_ORDER: readonly PlantId[] = ["carrot", "sunflower", "clover", "blueberry", "lily", "moonflower"];

export interface BuildingSpec {
  id: BuildingId;
  name: Name;
  area: AreaId;
  /** Cost of each level, from level 1 (or level 2 for buildings you start with). */
  levels: Cost[];
  effect: Name;
}

export const BUILDINGS: Record<BuildingId, BuildingSpec> = {
  cottage: {
    id: "cottage",
    name: n("Hamster cottage", "仓鼠小屋"),
    area: "meadow",
    levels: [{}, { beans: 200, wood: 20, stone: 10 }, { beans: 600, wood: 40, stone: 30, crystal: 2 }],
    effect: n("+5% beans for each level above 1.", "每升一级，数据豆 +5%。"),
  },
  lantern: {
    id: "lantern",
    name: n("Lantern path", "灯笼小路"),
    area: "meadow",
    levels: [{ beans: 120, wood: 10 }],
    effect: n("+1 dream dew every resting round.", "每个休息回合梦露 +1。"),
  },
  well: {
    id: "well",
    name: n("Wishing well", "许愿井"),
    area: "meadow",
    levels: [{ beans: 150, stone: 25 }],
    effect: n("Every plant grows a little more on resting rounds.", "休息回合里所有植物多长一点。"),
  },
  silo: {
    id: "silo",
    name: n("Bean silo", "豆仓"),
    area: "forest",
    levels: [{ beans: 300, wood: 30 }],
    effect: n("+10% data beans.", "数据豆 +10%。"),
  },
  workshop: {
    id: "workshop",
    name: n("Workshop", "工坊"),
    area: "forest",
    levels: [{ beans: 250, wood: 20, stone: 20 }],
    effect: n("Craft the lamp, rope, map and trowel.", "可以制作提灯、绳索、地图和小铲子。"),
  },
  pier: {
    id: "pier",
    name: n("Little pier", "小码头"),
    area: "lake",
    levels: [{ beans: 400, wood: 40 }],
    effect: n("Sometimes fishes a star crystal out of the lake at night.", "夜里有时能从湖里钓起星晶。"),
  },
  windmill: {
    id: "windmill",
    name: n("Windmill", "风车"),
    area: "hills",
    levels: [{ beans: 600, wood: 40, stone: 40 }],
    effect: n("Spins with the real wheel. +10% growth from work.", "跟着真实跑轮转动。运动带来的生长 +10%。"),
  },
  observatory: {
    id: "observatory",
    name: n("Observatory", "观星台"),
    area: "ruins",
    levels: [{ beans: 1000, stone: 30, crystal: 8 }],
    effect: n("Shows the boss's mood odds. +10% guild contribution.", "显示 Boss 的心情概率，公会贡献 +10%。"),
  },
};

export const BUILDING_ORDER: readonly BuildingId[] = ["cottage", "lantern", "well", "silo", "workshop", "pier", "windmill", "observatory"];

// ---- B. Adventure: items, routes, people ----------------------------------

export interface ItemSpec {
  id: ItemId;
  name: Name;
  cost: Cost;
  /** Needs the workshop to craft. */
  workshop: boolean;
  consumable: boolean;
  effect: Name;
}

export const ITEMS: Record<ItemId, ItemSpec> = {
  lamp: {
    id: "lamp",
    name: n("Lamp", "提灯"),
    cost: { wood: 10, stone: 5, crystal: 1 },
    workshop: true,
    consumable: false,
    effect: n("Lights dark caves and halls.", "照亮黑暗的山洞和大厅。"),
  },
  rope: {
    id: "rope",
    name: n("Rope", "绳索"),
    cost: { wood: 15 },
    workshop: true,
    consumable: false,
    effect: n("Crosses fallen logs and cliffs.", "翻过倒下的树干和悬崖。"),
  },
  map: {
    id: "map",
    name: n("Trail map", "地图"),
    cost: { beans: 60, wood: 5 },
    workshop: true,
    consumable: false,
    effect: n("+10% steps.", "步数 +10%。"),
  },
  trowel: {
    id: "trowel",
    name: n("Trowel", "小铲子"),
    cost: { stone: 10, wood: 5 },
    workshop: true,
    consumable: false,
    effect: n("Digs up one more of every find.", "每次发现多挖出一份。"),
  },
  snack: {
    id: "snack",
    name: n("Snack pack", "零食包"),
    cost: { sunseed: 3, carrot: 2 },
    workshop: false,
    consumable: true,
    effect: n("+25% steps for one whole expedition.", "整趟探险步数 +25%。"),
  },
  charm: {
    id: "charm",
    name: n("Clover charm", "幸运护符"),
    cost: { clover: 1, beans: 20 },
    workshop: false,
    consumable: true,
    effect: n("Gets you past one hazard you have no gear for.", "没带对装备时，帮你闯过一次险境。"),
  },
};

export const GEAR: readonly GearId[] = ["lamp", "rope", "map", "trowel"];
export const CONSUMABLES: readonly ConsumableId[] = ["snack", "charm"];
export const MAX_GEAR = 2;

export type Hazard = "dark" | "cliff";

export type RouteEvent =
  | { kind: "find"; res: ResourceId; min: number; max: number }
  | { kind: "seed"; plant: PlantId; count: number }
  | { kind: "npc"; npc: NpcId }
  | { kind: "hazard"; hazard: Hazard; place: string };

export interface RouteSpec {
  id: RouteId;
  name: Name;
  area: AreaId;
  length: number;
  /** Small finds along the trail on busy turns. */
  trail: ResourceId[];
  events: { weight: number; event: RouteEvent }[];
  reward: Cost;
  rewardSeeds: Partial<Record<PlantId, number>>;
  blurb: Name;
}

export const ROUTES: Record<RouteId, RouteSpec> = {
  mossy: {
    id: "mossy",
    name: n("Mossy Trail", "苔藓小径"),
    area: "meadow",
    length: 1500,
    trail: ["wood", "stone"],
    events: [
      { weight: 3, event: { kind: "find", res: "wood", min: 3, max: 6 } },
      { weight: 3, event: { kind: "find", res: "stone", min: 2, max: 5 } },
      { weight: 2, event: { kind: "npc", npc: "hedgehog" } },
      { weight: 2, event: { kind: "seed", plant: "carrot", count: 1 } },
      { weight: 1, event: { kind: "hazard", hazard: "cliff", place: "log" } },
    ],
    reward: { wood: 12, stone: 8, beans: 60, sunseed: 2 },
    rewardSeeds: { carrot: 1 },
    blurb: n("A short walk behind the cottage. Wood and pebbles.", "小屋后面的短途小路，盛产木材和石子。"),
  },
  woods: {
    id: "woods",
    name: n("Whispering Woods", "低语森林"),
    area: "forest",
    length: 3000,
    trail: ["wood", "wood", "stone"],
    events: [
      { weight: 3, event: { kind: "find", res: "wood", min: 5, max: 9 } },
      { weight: 2, event: { kind: "npc", npc: "owl" } },
      { weight: 2, event: { kind: "npc", npc: "firefly" } },
      { weight: 2, event: { kind: "seed", plant: "blueberry", count: 1 } },
      { weight: 2, event: { kind: "hazard", hazard: "cliff", place: "log" } },
      { weight: 1, event: { kind: "hazard", hazard: "dark", place: "hollow" } },
    ],
    reward: { wood: 20, stone: 10, beans: 120, crystal: 1 },
    rewardSeeds: { blueberry: 2 },
    blurb: n("Old trees, an owl who trades seeds, fireflies at night.", "古老的树林，卖种子的猫头鹰，夜里的萤火虫。"),
  },
  mirror: {
    id: "mirror",
    name: n("Mirror Lake", "镜湖"),
    area: "lake",
    length: 4000,
    trail: ["stone", "dew"],
    events: [
      { weight: 3, event: { kind: "find", res: "stone", min: 4, max: 8 } },
      { weight: 2, event: { kind: "npc", npc: "frog" } },
      { weight: 2, event: { kind: "seed", plant: "lily", count: 1 } },
      { weight: 2, event: { kind: "find", res: "dew", min: 6, max: 12 } },
      { weight: 1, event: { kind: "npc", npc: "crow" } },
      { weight: 2, event: { kind: "hazard", hazard: "dark", place: "fog" } },
    ],
    reward: { stone: 16, dew: 30, beans: 160, crystal: 1 },
    rewardSeeds: { lily: 2 },
    blurb: n("Still water, a riddling frog and foggy shores.", "平静的湖水，爱出谜语的青蛙，起雾的湖岸。"),
  },
  chime: {
    id: "chime",
    name: n("Windchime Hills", "风铃山"),
    area: "hills",
    length: 5500,
    trail: ["stone", "stone", "wood"],
    events: [
      { weight: 3, event: { kind: "find", res: "stone", min: 6, max: 10 } },
      { weight: 2, event: { kind: "npc", npc: "mole" } },
      { weight: 2, event: { kind: "hazard", hazard: "cliff", place: "cliff" } },
      { weight: 1, event: { kind: "hazard", hazard: "dark", place: "cave" } },
      { weight: 1, event: { kind: "find", res: "crystal", min: 1, max: 1 } },
      { weight: 1, event: { kind: "seed", plant: "clover", count: 1 } },
    ],
    reward: { stone: 30, wood: 10, beans: 220, crystal: 2 },
    rewardSeeds: { clover: 1 },
    blurb: n("Windy ridges, cliffs, and a mole who knows the caves.", "大风山脊、悬崖，以及熟悉山洞的鼹鼠。"),
  },
  starfall: {
    id: "starfall",
    name: n("Starfall Ruins", "星落遗迹"),
    area: "ruins",
    length: 8000,
    trail: ["stone", "dew"],
    events: [
      { weight: 2, event: { kind: "find", res: "crystal", min: 1, max: 2 } },
      { weight: 2, event: { kind: "hazard", hazard: "dark", place: "hall" } },
      { weight: 2, event: { kind: "npc", npc: "crow" } },
      { weight: 2, event: { kind: "npc", npc: "frog" } },
      { weight: 2, event: { kind: "seed", plant: "moonflower", count: 1 } },
      { weight: 1, event: { kind: "hazard", hazard: "cliff", place: "stair" } },
    ],
    reward: { crystal: 4, dew: 40, beans: 320 },
    rewardSeeds: { moonflower: 2 },
    blurb: n("Fallen stars, dark halls and the rarest seeds.", "坠落的星星、黑暗的大厅和最稀有的种子。"),
  },
};

export const ROUTE_ORDER: readonly RouteId[] = ["mossy", "woods", "mirror", "chime", "starfall"];

/**
 * Waypoints at 20, 40, 60, 80 and 100% of a route; the last one is the
 * route's treasure. The fork waits at the second waypoint, and the path picked
 * there decides how the third and fourth go.
 */
export const NODES = 5;
export const FORK_NODE = 1;
export const nodeSteps = (length: number, node: number) => Math.round((length * (node + 1)) / NODES);

export interface NpcSpec {
  id: NpcId;
  name: Name;
}

export const NPCS: Record<NpcId, NpcSpec> = {
  owl: { id: "owl", name: n("Ollie the owl merchant", "猫头鹰商人奥利") },
  frog: { id: "frog", name: n("Old Frog the sage", "青蛙智者老呱") },
  mole: { id: "mole", name: n("Moss the mole miner", "鼹鼠矿工摩斯") },
  firefly: { id: "firefly", name: n("Pip the firefly", "萤火虫皮皮") },
  crow: { id: "crow", name: n("Corvin the crow collector", "乌鸦收藏家科文") },
  hedgehog: { id: "hedgehog", name: n("Hazel the hedgehog", "刺猬旅人榛子") },
};

// ---- D. Guild: seasons, bosses, guilds, classes ----------------------------

/** Season 1 began on Monday 2 November 2026 at 12:00 UTC (20:00 Beijing). Seasons last a week. */
export const SEASON_EPOCH = Date.UTC(2026, 10, 2, 12, 0, 0);
export const WEEK_MS = 7 * 24 * 3600 * 1000;

export interface BossSpec {
  id: BossId;
  name: Name;
  title: Name;
  /** Shared hit points in work units; everyone fights the same boss. */
  hp: number;
  /** How often each mood comes up, in percent. */
  moods: Record<StanceId, number>;
  color: string;
}

export const BOSSES: readonly BossSpec[] = [
  {
    id: "tangerine",
    name: n("Mount Tangerine", "橘子山"),
    title: n("the napping cat", "打盹的大橘猫"),
    hp: 50_000,
    moods: { drowsy: 40, fierce: 20, shielded: 20, tricky: 20 },
    color: "#f0a04b",
  },
  {
    id: "clockcrow",
    name: n("Clockwork Crow", "咔哒"),
    title: n("the gear-eating crow", "吃齿轮的发条乌鸦"),
    hp: 55_000,
    moods: { shielded: 40, fierce: 20, drowsy: 20, tricky: 20 },
    color: "#5d6f8a",
  },
  {
    id: "fogserpent",
    name: n("Mistcoil", "绵绵"),
    title: n("the fog serpent", "迷雾长蛇"),
    hp: 60_000,
    moods: { tricky: 40, fierce: 20, shielded: 20, drowsy: 20 },
    color: "#8fa3c9",
  },
  {
    id: "frostowl",
    name: n("Frostmoon", "霜月"),
    title: n("the winter owl", "冬夜猫头鹰"),
    hp: 65_000,
    moods: { fierce: 40, shielded: 20, drowsy: 20, tricky: 20 },
    color: "#9ccbe0",
  },
];

export const STANCES: readonly StanceId[] = ["fierce", "shielded", "drowsy", "tricky"];

export const STANCE_NAMES: Record<StanceId, Name> = {
  fierce: n("Fierce", "狂暴"),
  shielded: n("Shielded", "护盾"),
  drowsy: n("Drowsy", "打盹"),
  tricky: n("Tricky", "迷惑"),
};

export interface GuildSpec {
  id: GuildId;
  name: Name;
  perk: Name;
  color: string;
}

export const GUILDS: Record<GuildId, GuildSpec> = {
  seed: { id: "seed", name: n("Seedkeepers", "种子会"), perk: n("+10% plant growth", "植物生长 +10%"), color: "#5f9e4f" },
  lantern: { id: "lantern", name: n("Lanternbearers", "灯笼会"), perk: n("+10% expedition steps", "探险步数 +10%"), color: "#e09a3a" },
  cog: { id: "cog", name: n("Cogwrights", "齿轮会"), perk: n("-10% beans on builds and new areas", "建造和解锁区域少花 10% 数据豆"), color: "#7d8796" },
  star: { id: "star", name: n("Stardreamers", "星尘会"), perk: n("+1 dream dew every resting round", "每个休息回合梦露 +1"), color: "#8a79e8" },
};

export const GUILD_ORDER: readonly GuildId[] = ["seed", "lantern", "cog", "star"];

export interface ClassSpec {
  id: ClassId;
  name: Name;
  skill: Name;
  /** The action this class is best at, and how much better (percent). */
  best: ActionId;
  bonus: number;
}

export const CLASSES: Record<ClassId, ClassSpec> = {
  guardian: { id: "guardian", name: n("Guardian", "卫士"), skill: n("Guard counts 1.5×", "防守效果 ×1.5"), best: "guard", bonus: 150 },
  ranger: { id: "ranger", name: n("Ranger", "游侠"), skill: n("Strike counts 1.5×", "攻击效果 ×1.5"), best: "strike", bonus: 150 },
  herbalist: {
    id: "herbalist",
    name: n("Herbalist", "药师"),
    skill: n("Support counts 1.3×, 1.6× with a blueberry", "支援效果 ×1.3，消耗蓝莓时 ×1.6"),
    best: "support",
    bonus: 130,
  },
  scout: { id: "scout", name: n("Scout", "寻宝鼠"), skill: n("Scavenging finds twice as much", "寻宝收获翻倍"), best: "scavenge", bonus: 150 },
};

export const CLASS_ORDER: readonly ClassId[] = ["guardian", "ranger", "herbalist", "scout"];

export const ACTION_NAMES: Record<ActionId, Name> = {
  strike: n("Strike", "攻击"),
  guard: n("Guard", "防守"),
  support: n("Support", "支援"),
  scavenge: n("Scavenge", "寻宝"),
};

export const ACTION_ORDER: readonly ActionId[] = ["strike", "guard", "support", "scavenge"];

/** How well an action works against each mood, in percent of the turn's work. */
export const EFFECT: Record<ActionId, Record<StanceId, number>> = {
  strike: { drowsy: 200, tricky: 100, fierce: 100, shielded: 50 },
  guard: { fierce: 200, shielded: 100, tricky: 100, drowsy: 50 },
  support: { shielded: 150, tricky: 150, fierce: 100, drowsy: 100 },
  scavenge: { fierce: 50, shielded: 50, drowsy: 50, tricky: 50 },
};

/** Contribution for every resting round, whatever the action: night watch. */
export const NIGHT_WATCH = 10;

export interface ChestTier {
  id: "bronze" | "silver" | "gold" | "rainbow";
  name: Name;
  min: number;
  reward: Cost;
  seeds: Partial<Record<PlantId, number>>;
}

export const CHEST_TIERS: readonly ChestTier[] = [
  { id: "bronze", name: n("Bronze chest", "铜宝箱"), min: 1_000, reward: { beans: 150, wood: 5, stone: 5 }, seeds: {} },
  { id: "silver", name: n("Silver chest", "银宝箱"), min: 5_000, reward: { beans: 400, wood: 15, stone: 15, crystal: 1 }, seeds: { clover: 1 } },
  { id: "gold", name: n("Gold chest", "金宝箱"), min: 15_000, reward: { beans: 900, wood: 30, stone: 30, crystal: 3 }, seeds: { blueberry: 1 } },
  {
    id: "rainbow",
    name: n("Rainbow chest", "彩虹宝箱"),
    min: 30_000,
    reward: { beans: 1600, wood: 50, stone: 50, crystal: 6 },
    seeds: { moonflower: 1, lily: 1 },
  },
];

/** Shared boss damage from real community activity on Squeekchain, per event type. */
export const COMMUNITY_DAMAGE: Record<string, number> = {
  "account.rewards_claimed": 20,
  "account.claim_recipient_set": 10,
  "account.rewards_staked": 40,
  "account.sqk_staked": 40,
  "account.sqk_unstaked": 10,
  "nft.deposited": 30,
  "nft.withdrawn": 10,
  "nft.merged": 120,
  "nft.launch_claimed": 60,
};

/** Shared critical hits when the real hamster reaches a milestone. */
export const MILESTONE_DAMAGE: Record<string, number> = {
  "measurement.distance_milestone": 1500,
  "measurement.daily_distance_milestone": 500,
  "measurement.speed_milestone": 400,
  "measurement.speed_record": 1000,
  "measurement.distance_streak": 800,
};

// ---- Starting world --------------------------------------------------------

export const START_RESOURCES: Cost = { beans: 100, wood: 10, stone: 10, sunseed: 3 };
export const START_SEEDS: Partial<Record<PlantId, number>> = { carrot: 2, clover: 1 };

export const BEANS_PER_WORK = 10;
export const DEW_PER_REST = 2;
export const DIARY_LIMIT = 300;
export const NEWS_LIMIT = 30;
/** Resting rounds merged into one diary entry at most. */
export const REST_ENTRY_ROUNDS = 18;

export function itemName(id: ItemId): Name {
  return ITEMS[id].name;
}
