import type { Language } from "../core/i18n";
import {
  ACTION_NAMES,
  AREAS,
  BOSSES,
  BUILDINGS,
  CHEST_TIERS,
  GUILDS,
  ITEMS,
  NPCS,
  PLANTS,
  RESOURCE_NAMES,
  ROUTES,
  STANCE_NAMES,
  type Name,
} from "./data";
import type { ActionId, ItemId, Line, PlantId, ResourceId, StanceId } from "./types";

// Every word the world shows, in English and Chinese. The diary stores only
// message keys and values (see Line), so it reads in either language and old
// entries follow a language switch.

type Values = Record<string, string | number>;

const locales: Record<Language, string> = { en: "en-US", zh: "zh-CN" };

export const nm = (lang: Language, name: Name) => name[lang];

export function num(lang: Language, value: number): string {
  return new Intl.NumberFormat(locales[lang]).format(value);
}

// ---- Nouns -----------------------------------------------------------------

const EN_RES: Record<ResourceId, [string, string]> = {
  beans: ["data bean", "data beans"],
  dew: ["dream dew", "dream dew"],
  wood: ["wood", "wood"],
  stone: ["pebble", "pebbles"],
  crystal: ["star crystal", "star crystals"],
  carrot: ["carrot", "carrots"],
  sunseed: ["sunflower seed", "sunflower seeds"],
  berry: ["blueberry", "blueberries"],
  clover: ["lucky clover", "lucky clovers"],
};

const ZH_MEASURE: Record<ResourceId, string> = {
  beans: "颗",
  dew: "滴",
  wood: "根",
  stone: "颗",
  crystal: "颗",
  carrot: "根",
  sunseed: "颗",
  berry: "颗",
  clover: "片",
};

const EN_PLANT: Record<PlantId, string> = {
  carrot: "carrot",
  sunflower: "sunflower",
  clover: "lucky clover",
  blueberry: "blueberry",
  lily: "water lily",
  moonflower: "moonflower",
};

const EN_ITEM: Record<ItemId, string> = {
  lamp: "lamp",
  rope: "rope",
  map: "trail map",
  trowel: "trowel",
  snack: "snack pack",
  charm: "clover charm",
};

const PLACES: Record<string, Name> = {
  log: { en: "fallen log", zh: "倒下的大树" },
  hollow: { en: "dark hollow", zh: "漆黑的树洞" },
  fog: { en: "fog bank", zh: "浓雾" },
  cliff: { en: "cliff", zh: "悬崖" },
  cave: { en: "cave", zh: "山洞" },
  hall: { en: "dark hall", zh: "黑暗的大厅" },
  stair: { en: "broken stair", zh: "断掉的石阶" },
};

const PATHS: Record<string, Name> = {
  safe: { en: "the safe path", zh: "稳妥小路" },
  risky: { en: "the risky shortcut", zh: "冒险近道" },
};

/** "3 star crystals" / "3 颗星晶". */
export function amount(lang: Language, res: ResourceId, n: number): string {
  if (lang === "zh") return `${num(lang, n)} ${ZH_MEASURE[res]}${RESOURCE_NAMES[res].zh}`;
  const [one, many] = EN_RES[res];
  return `${num(lang, n)} ${n === 1 ? one : many}`;
}

export function seedPackets(lang: Language, plant: PlantId, n: number): string {
  if (lang === "zh") return `${num(lang, n)} 包${PLANTS[plant].name.zh}种子`;
  return `${num(lang, n)} ${EN_PLANT[plant]} seed packet${n === 1 ? "" : "s"}`;
}

const joinList = (lang: Language, parts: string[]) => (lang === "zh" ? parts.join("、") : parts.join(", "));

/** Renders "wood:12,stone:8,seed.carrot:1" (see rewardList in the engine). */
export function rewards(lang: Language, list: string): string {
  if (!list) return lang === "zh" ? "什么也没有" : "nothing";
  const parts = list.split(",").map((part) => {
    const [key, value] = part.split(":");
    const n = Number(value);
    if (key.startsWith("seed.")) return seedPackets(lang, key.slice(5) as PlantId, n);
    return amount(lang, key as ResourceId, n);
  });
  return joinList(lang, parts);
}

const plantInline = (lang: Language, id: PlantId) => (lang === "zh" ? PLANTS[id].name.zh : EN_PLANT[id]);
const itemInline = (lang: Language, id: ItemId) => (lang === "zh" ? ITEMS[id].name.zh : EN_ITEM[id]);
const stanceInline = (lang: Language, id: StanceId) => (lang === "zh" ? STANCE_NAMES[id].zh : STANCE_NAMES[id].en.toLowerCase());
const actionInline = (lang: Language, id: ActionId) => {
  if (lang === "zh") return ACTION_NAMES[id].zh;
  return id === "scavenge" ? "scavenging" : ACTION_NAMES[id].en.toLowerCase();
};

// ---- Diary lines -------------------------------------------------------------

interface Ctx {
  lang: Language;
  v: Values;
  n(key: string): string;
  /** A round number, printed without grouping. */
  r(key: string): string;
  plant(key?: string): string;
  plants(): string;
  res(): string;
  amt(): string;
  route(): string;
  building(): string;
  area(): string;
  item(): string;
  gear(): string;
  guild(): string;
  boss(): string;
  stance(): string;
  action(): string;
  chest(): string;
  place(): string;
  path(): string;
  items(): string;
  pick<T>(options: readonly T[]): T;
}

type LineFn = (c: Ctx) => string;

const EN_LINES: Record<string, LineFn> = {
  "d.start": (c) => `The world began after round ${c.r("to")}: a small meadow, a cottage, a wheel and three empty beds.`,
  "d.head.active": (c) => {
    const rounds = Number(c.v.rounds);
    const settled = c.v.sim ? "" : " settled";
    const where = rounds > 1 ? `Rounds ${String(Number(c.v.to) - rounds + 1)}–${c.r("to")}${settled}` : `Round ${c.r("to")}${settled}`;
    const blocks = Number(c.v.blocks) > 0 ? ` ${c.n("blocks")} Squeek block${Number(c.v.blocks) === 1 ? "" : "s"} sealed.` : "";
    // Trial turns are made up: they never claim to be settled on Sepolia.
    const on = c.v.sim ? " (simulated)" : " on Sepolia";
    return `${where}${on}: ${c.n("work")} work units became ${c.n("beans")} data beans.${blocks}`;
  },
  "d.head.rest": (c) => {
    const rounds = Number(c.v.rounds);
    const span = rounds > 1 ? `rounds ${c.r("from")}–${c.r("to")}` : `round ${c.r("to")}`;
    return `${rounds > 1 ? `${c.n("rounds")} resting rounds` : "A resting round"} (${span}). Squeektoshi slept and gathered ${c.n("dew")} dream dew.`;
  },
  "d.garden.grow": (c) => c.pick([`The ${c.plants()} grew a little.`, `The ${c.plants()} stretched a little taller.`, `The beds rustled: ${c.plants()} growing.`]),
  "d.garden.ripe": (c) => `The ${c.plant()} in bed ${c.n("n")} is ripe!`,
  "d.event.build": (c) => (Number(c.v.n) <= 1 ? `Built the ${c.building()}.` : `Upgraded the ${c.building()} to level ${c.n("n")}.`),
  "d.event.unlock": (c) => `Unlocked a new area: ${c.area()}.`,
  "d.event.depart": (c) => `Set off for ${c.route()} with ${c.gear()}.`,
  "d.event.recall": (c) => `Came home early from ${c.route()}.`,
  "d.event.guild": (c) => `Joined the ${c.guild()} for season ${c.n("season")}.`,
  "d.event.chest": (c) => `Opened the season ${c.n("season")} ${c.chest().toLowerCase()}: ${c.items()}.`,
  "d.adv.fork": (c) => `At the fork on ${c.route()}, took ${c.path()}.`,
  "d.adv.find": (c) => c.pick([`Found ${c.amt()}.`, `Dug up ${c.amt()}.`, `Spotted ${c.amt()} by the path.`]),
  "d.adv.seed": (c) => `Found ${seedPackets("en", c.v.plant as PlantId, Number(c.v.n))}.`,
  "d.adv.hazard.gear": (c) => `The ${c.item()} got us past the ${c.place()}.`,
  "d.adv.hazard.charm": (c) => `No gear for the ${c.place()}, but the clover charm glowed and showed the way.`,
  "d.adv.hazard.fail": (c) => `The ${c.place()} was too much without a ${c.item()}. Went back ${c.n("steps")} steps.`,
  "d.adv.camp": (c) =>
    c.pick([`Camped on ${c.route()} while Squeektoshi slept.`, `A quiet night at camp on ${c.route()}.`, `The tent on ${c.route()} glowed softly all through the rest.`]),
  "d.adv.trail": (c) => `Picked up ${c.amt()} on the trail.`,
  "d.adv.steps": (c) => `${c.n("steps")} steps on ${c.route()} (${c.n("pct")}% of the way).`,
  "d.adv.done": (c) => c.pick([`Reached the end of ${c.route()}! Treasure: ${c.items()}.`, `${c.route()} complete. Brought home ${c.items()}.`]),
  "d.npc.owl": (c) =>
    c.pick([
      `Ollie the owl traded ${seedPackets("en", c.v.plant as PlantId, Number(c.v.n))} for a story.`,
      `Ollie the owl hooted twice and dropped ${seedPackets("en", c.v.plant as PlantId, Number(c.v.n))}.`,
    ]),
  "d.npc.frog.clover": (c) => `Old Frog took a lucky clover and gave back ${amount("en", "crystal", Number(c.v.n))}.`,
  "d.npc.frog.win": (c) => `Solved Old Frog's riddle! +${c.n("n")} dream dew.`,
  "d.npc.frog.lose": (c) => `Old Frog's riddle was too hard. A consolation ${c.n("n")} dream dew.`,
  "d.npc.mole.lamp": (c) => `Moss the mole shared ${amount("en", "stone", Number(c.v.n))} by lamplight, and a star crystal from deep in the cave.`,
  "d.npc.mole": (c) => `Moss the mole shared ${amount("en", "stone", Number(c.v.n))}.`,
  "d.npc.firefly": (c) => `Pip the firefly lit a shortcut: +${c.n("steps")} steps.`,
  "d.npc.crow.trade": (c) => `Corvin the crow swapped ${amount("en", "crystal", Number(c.v.n))} for 10 pebbles.`,
  "d.npc.crow": (c) => `Corvin the crow had nothing to trade and left ${amount("en", "stone", Number(c.v.n))}.`,
  "d.npc.hedgehog": (c) => `Hazel the hedgehog shared ${seedPackets("en", c.v.plant as PlantId, Number(c.v.n))} and a sunflower seed.`,
  "d.guild.hit": (c) =>
    c.pick([`${c.boss()} looked ${c.stance()}. Our ${c.action()} counted for ${c.n("n")}.`, `Faced ${c.boss()} (${c.stance()}): ${c.action()} for ${c.n("n")}.`]) +
    (Number(c.v.berry) ? " A blueberry helped." : ""),
  "d.guild.loot": (c) => `Scavenged ${c.amt()}.`,
  "d.guild.watch": (c) => `Night watch against ${c.boss()}: +${c.n("n")} contribution.`,
  "d.gap": (c) => `${c.n("rounds")} rounds passed while the world was closed, too long ago to read back. They gave nothing.`,
  "d.pier": () => "Fished a star crystal out of the lake from the pier.",
  "d.reset": () => "Squeekchain started a new deployment. Everything you have is kept; the rounds start over.",
};

const ZH_LINES: Record<string, LineFn> = {
  "d.start": (c) => `世界从第 ${c.r("to")} 轮之后开始：一片小草地、一座小屋、一个跑轮，还有三块空菜地。`,
  "d.head.active": (c) => {
    const rounds = Number(c.v.rounds);
    const where = rounds > 1 ? `第 ${String(Number(c.v.to) - rounds + 1)}–${c.r("to")} 轮` : `第 ${c.r("to")} 轮`;
    const blocks = Number(c.v.blocks) > 0 ? `封存了 ${c.n("blocks")} 个 Squeek 区块。` : "";
    const on = c.v.sim ? "（模拟）" : "在 Sepolia 上结算";
    return `${where}${on}：${c.n("work")} 个工作单位换来 ${c.n("beans")} 颗数据豆。${blocks}`;
  },
  "d.head.rest": (c) => {
    const rounds = Number(c.v.rounds);
    const span = rounds > 1 ? `第 ${c.r("from")}–${c.r("to")} 轮` : `第 ${c.r("to")} 轮`;
    return `休息了 ${c.n("rounds")} 轮（${span}），Squeektoshi 睡着了，收集到 ${c.n("dew")} 滴梦露。`;
  },
  "d.garden.grow": (c) => c.pick([`${c.plants()}又长高了一点。`, `菜地里的${c.plants()}悄悄长大。`, `${c.plants()}在土里伸了个懒腰。`]),
  "d.garden.ripe": (c) => `第 ${c.n("n")} 块地的${c.plant()}成熟了！`,
  "d.event.build": (c) => (Number(c.v.n) <= 1 ? `盖好了${c.building()}。` : `${c.building()}升到了 ${c.n("n")} 级。`),
  "d.event.unlock": (c) => `解锁了新区域：${c.area()}。`,
  "d.event.depart": (c) => `带着${c.gear()}出发去${c.route()}。`,
  "d.event.recall": (c) => `从${c.route()}提前回家了。`,
  "d.event.guild": (c) => `加入了${c.guild()}（第 ${c.n("season")} 季）。`,
  "d.event.chest": (c) => `打开了第 ${c.n("season")} 季的${c.chest()}：${c.items()}。`,
  "d.adv.fork": (c) => `在${c.route()}的岔路口选了${c.path()}。`,
  "d.adv.find": (c) => c.pick([`找到了${c.amt()}。`, `挖出了${c.amt()}。`, `在路边发现了${c.amt()}。`]),
  "d.adv.seed": (c) => `找到了${seedPackets("zh", c.v.plant as PlantId, Number(c.v.n))}。`,
  "d.adv.hazard.gear": (c) => `靠着${c.item()}，穿过了${c.place()}。`,
  "d.adv.hazard.charm": (c) => `没有合适的装备闯${c.place()}，幸运护符一闪，指出了路。`,
  "d.adv.hazard.fail": (c) => `没带${c.item()}，过不去${c.place()}，退回了 ${c.n("steps")} 步。`,
  "d.adv.camp": (c) => c.pick([`在${c.route()}扎营，Squeektoshi 睡着了。`, `${c.route()}的营地，一个安静的夜晚。`, `${c.route()}上的小帐篷整夜亮着暖光。`]),
  "d.adv.trail": (c) => `路上顺手捡到${c.amt()}。`,
  "d.adv.steps": (c) => `在${c.route()}走了 ${c.n("steps")} 步（全程 ${c.n("pct")}%）。`,
  "d.adv.done": (c) => c.pick([`走完了${c.route()}！终点宝藏：${c.items()}。`, `${c.route()}探险完成，带回了${c.items()}。`]),
  "d.npc.owl": (c) =>
    c.pick([
      `猫头鹰奥利用${seedPackets("zh", c.v.plant as PlantId, Number(c.v.n))}换了一个故事。`,
      `猫头鹰奥利咕咕两声，丢下${seedPackets("zh", c.v.plant as PlantId, Number(c.v.n))}。`,
    ]),
  "d.npc.frog.clover": (c) => `老呱收下一片幸运草，回赠了${amount("zh", "crystal", Number(c.v.n))}。`,
  "d.npc.frog.win": (c) => `答对了老呱的谜语！梦露 +${c.n("n")}。`,
  "d.npc.frog.lose": (c) => `老呱的谜语太难了，安慰奖：梦露 +${c.n("n")}。`,
  "d.npc.mole.lamp": (c) => `鼹鼠摩斯借着提灯的光分了${amount("zh", "stone", Number(c.v.n))}，还从洞底挖出一颗星晶。`,
  "d.npc.mole": (c) => `鼹鼠摩斯分了${amount("zh", "stone", Number(c.v.n))}。`,
  "d.npc.firefly": (c) => `萤火虫皮皮照亮了一条近路：+${c.n("steps")} 步。`,
  "d.npc.crow.trade": (c) => `乌鸦科文用${amount("zh", "crystal", Number(c.v.n))}换走了 10 颗石子。`,
  "d.npc.crow": (c) => `乌鸦科文没什么可换的，留下${amount("zh", "stone", Number(c.v.n))}。`,
  "d.npc.hedgehog": (c) => `刺猬榛子分享了${seedPackets("zh", c.v.plant as PlantId, Number(c.v.n))}和一颗葵花籽。`,
  "d.guild.hit": (c) =>
    c.pick([`${c.boss()}一副${c.stance()}的样子，我们的${c.action()}贡献了 ${c.n("n")}。`, `迎战${c.boss()}（${c.stance()}）：${c.action()}贡献 ${c.n("n")}。`]) +
    (Number(c.v.berry) ? "用掉了一颗蓝莓。" : ""),
  "d.guild.loot": (c) => `寻宝找到了${c.amt()}。`,
  "d.guild.watch": (c) => `守夜防备${c.boss()}：贡献 +${c.n("n")}。`,
  "d.gap": (c) => `世界关着的时候过去了 ${c.n("rounds")} 轮，太久远读不回来了，这些回合没有收益。`,
  "d.pier": () => "在小码头从湖里钓起了一颗星晶。",
  "d.reset": () => "Squeekchain 启用了新的部署。你的一切都保留，回合重新计数。",
};

function context(lang: Language, v: Values): Ctx {
  const s = (key: string) => String(v[key] ?? "");
  const named = <T extends string>(table: Record<T, { name: Name }>, key: string) => {
    const entry = table[s(key) as T];
    return entry ? entry.name[lang] : s(key);
  };
  return {
    lang,
    v,
    n: (key) => num(lang, Number(v[key] ?? 0)),
    r: (key) => String(v[key] ?? ""),
    plant: (key = "plant") => plantInline(lang, s(key) as PlantId),
    plants: () =>
      joinList(
        lang,
        s("plants")
          .split(",")
          .filter(Boolean)
          .map((p) => plantInline(lang, p as PlantId)),
      ),
    res: () => (lang === "zh" ? RESOURCE_NAMES[s("res") as ResourceId]?.zh ?? s("res") : EN_RES[s("res") as ResourceId]?.[1] ?? s("res")),
    amt: () => amount(lang, s("res") as ResourceId, Number(v.n ?? 0)),
    route: () => named(ROUTES, "route"),
    building: () => {
      const spec = BUILDINGS[s("building") as keyof typeof BUILDINGS];
      if (!spec) return s("building");
      return lang === "zh" ? spec.name.zh : spec.name.en.toLowerCase();
    },
    area: () => AREAS.find((a) => a.id === s("area"))?.name[lang] ?? s("area"),
    item: () => itemInline(lang, s("item") as ItemId),
    gear: () => {
      const gear = s("gear").split(",").filter(Boolean) as ItemId[];
      if (!gear.length) return lang === "zh" ? "一身勇气" : "nothing but courage";
      return joinList(
        lang,
        gear.map((g) => (lang === "zh" ? ITEMS[g].name.zh : `the ${EN_ITEM[g]}`)),
      );
    },
    guild: () => named(GUILDS, "guild"),
    boss: () => BOSSES.find((b) => b.id === s("boss"))?.name[lang] ?? s("boss"),
    stance: () => stanceInline(lang, s("stance") as StanceId),
    action: () => actionInline(lang, s("action") as ActionId),
    chest: () => CHEST_TIERS.find((tier) => tier.id === s("chest"))?.name[lang] ?? s("chest"),
    place: () => PLACES[s("place")]?.[lang] ?? s("place"),
    path: () => PATHS[s("path")]?.[lang] ?? s("path"),
    items: () => rewards(lang, s("items")),
    pick: (options) => options[Number(v._ ?? 0) % options.length],
  };
}

/** One diary or news line in the given language. Unknown keys render as nothing. */
export function renderLine(lang: Language, line: Line): string {
  const table = lang === "zh" ? ZH_LINES : EN_LINES;
  const fn = table[line.k] ?? EN_LINES[line.k];
  if (!fn) return "";
  const values = line.v ?? {};
  return fn(context(lang, values));
}

export const hasLine = (key: string) => key in EN_LINES && key in ZH_LINES;

// ---- Interface strings -------------------------------------------------------

const en = {
  "app.title": "Squeek Pet World",
  "app.tagline": "A little world that grows with the real hamster.",
  "mode.real": "Real world",
  "mode.sim": "Trial world",
  "badge.live": "LIVE · SEPOLIA",
  "badge.trial": "TRIAL · SIMULATED",
  "sync.settled": "Settled through round {n}",
  "sync.syncing": "Reading settlements…",
  "sync.ago": "Synced {ago}",
  "sync.never": "Not synced yet",
  "sync.error": "Can't reach Squeekchain right now. Showing your last save.",
  "sync.busy": "Squeekchain is busy. Trying again shortly.",
  "sync.founding": "Founding your world on the latest settled round…",
  "sync.reorg": "Sepolia replaced a recent settlement. The world was replayed so every round counts once.",
  "sync.retry": "Retry",
  "live.running": "Squeektoshi is running · {rpm} RPM",
  "live.resting": "Squeektoshi is resting · dream dew time",
  "live.offline": "No live wheel reading",
  "live.labelled": "{label} data",
  "pending.title": "On the way",
  "pending.body": "{n} work units are measured but not settled yet (about {beans} data beans). They count once SqueekCore settles them on Sepolia.",
  "pending.none": "Everything measured so far is settled.",
  "res.title": "Bag",
  "tab.home": "Home",
  "tab.adventure": "Adventure",
  "tab.log": "Log",
  "tab.guild": "Guild",
  "home.beds": "Garden beds",
  "home.bed": "Bed {n}",
  "home.empty": "Empty bed",
  "home.plant": "Plant",
  "home.harvest": "Harvest",
  "home.clear": "Clear",
  "home.clearConfirm": "Clear the {plant}? Its growth is lost.",
  "home.growth": "{pct}% grown",
  "home.ripe": "Ripe!",
  "home.growsOn.work": "Grows while running",
  "home.growsOn.rest": "Grows while resting",
  "home.growsOn.both": "Grows day and night",
  "home.pick": "What should grow in bed {n}?",
  "home.cancel": "Cancel",
  "home.seedPackets": "{n} packets",
  "home.seedRes": "{n} in the bag",
  "home.onlyIn": "Only in {area}",
  "home.yields": "Gives {items}",
  "home.buildings": "Buildings",
  "home.build": "Build",
  "home.upgrade": "Upgrade",
  "home.level": "Lv {n}",
  "home.max": "Max level",
  "home.notBuilt": "Not built",
  "home.areas": "Map",
  "home.unlock": "Unlock",
  "home.unlocked": "Unlocked",
  "home.needsPrevious": "Unlock {area} first",
  "home.craft": "Workshop and pantry",
  "home.make": "Make",
  "home.owned": "Owned",
  "home.have": "Have {n}",
  "home.needsWorkshop": "Needs the workshop",
  "home.lockedArea": "Locked",
  "adv.current": "On the trail",
  "adv.progress": "{steps} of {length} steps",
  "adv.stop": "Stop {n}",
  "adv.treasure": "Treasure",
  "adv.forkTitle": "A fork comes after the second stop",
  "adv.forkChosen": "Path: {path}",
  "adv.safe": "Safe path",
  "adv.safeNote": "Fewer hazards.",
  "adv.risky": "Risky shortcut",
  "adv.riskyNote": "Twice the hazards, twice the finds.",
  "adv.recall": "Come home",
  "adv.recallConfirm": "End the trip now? Everything found so far stays in the bag; the treasure at the end is lost.",
  "adv.found": "Found so far",
  "adv.nothingYet": "Nothing yet",
  "adv.carrying": "Carrying",
  "adv.plan": "Plan an expedition",
  "adv.gear": "Gear (up to {n})",
  "adv.extras": "Supplies",
  "adv.depart": "Set off",
  "adv.needArea": "Unlock {area} first",
  "adv.steps": "{n} steps",
  "adv.hazards": "Hazards",
  "adv.hazard.dark": "darkness (lamp)",
  "adv.hazard.cliff": "climbs (rope)",
  "adv.done": "Done {n}×",
  "adv.how": "Every settled work unit is one step. While Squeektoshi rests, the expedition camps. Finds along the way are drawn from each settlement's own block hash.",
  "adv.people": "Friends met on the road",
  "adv.metTimes": "Met {n}×",
  "adv.notMet": "Not met yet",
  "adv.noGear": "Make gear in the workshop (Home) first.",
  "adv.none": "None",
  "guild.season": "Season {n}",
  "guild.endsIn": "Ends in {time}",
  "guild.boss": "This week's boss",
  "guild.hp": "{left} / {hp} HP",
  "guild.defeated": "Defeated! Every chest this season is one tier better.",
  "guild.shared": "Everyone sees the same boss. Its HP falls with the real hamster's settled work this week, real Squeekchain activity and the hamster's milestones.",
  "guild.fromHamster": "Hamster",
  "guild.fromCommunity": "Community",
  "guild.fromMilestones": "Milestones",
  "guild.actions": "{n} on-chain actions · up to {cap}",
  "guild.milestones": "{n} milestones · up to {cap}",
  "guild.full": "Full share: {pct}% of its HP",
  "guild.settledWork": "Settled work this season",
  "guild.caps": "Community activity can take off at most {community}% of its HP and milestones {milestones}%, so the hamster's own settled work always lands at least half.",
  "guild.waitBoss": "Reading season {n}'s boss result…",
  "guild.loading": "Reading this week's settlements…",
  "guild.unknown": "Can't read this week's data right now.",
  "guild.partial": "Some community pages couldn't be read; real damage may be higher.",
  "guild.simBoss": "Trial boss: only the trial world's made-up work counts.",
  "guild.join": "Join a guild",
  "guild.joinFor": "Join for season {n}",
  "guild.joinNext": "Pick next season's guild",
  "guild.member": "{guild} · season {n}",
  "guild.notMember": "Not in a guild this season. Join one to fight the boss and earn a chest.",
  "guild.next": "Next season: {guild}",
  "guild.perk": "Perk",
  "guild.class": "Class",
  "guild.action": "Each settled turn",
  "guild.actionNote": "The boss's mood is drawn from each settlement's block hash, so nobody knows it in advance. Pick what works best on average.",
  "guild.vs": "vs {stance}",
  "guild.moods": "Boss mood odds",
  "guild.moodsLocked": "Build the observatory to read the boss's moods.",
  "guild.contribution": "Your contribution",
  "guild.watch": "Resting rounds count as night watch: +{n} each.",
  "guild.chest": "Season chest",
  "guild.chestNow": "Now: {chest}",
  "guild.chestNone": "No chest yet",
  "guild.chestNext": "{n} more for the {chest}",
  "guild.chestTop": "Top tier reached",
  "guild.chestOpensAfter": "Opens after the season ends.",
  "guild.open": "Open the season {n} chest",
  "guild.hits": "{n} turns fought",
  "guild.noLeaderboard": "No leaderboard: comparing players would need a server, and Squeek Pet keeps everything on your device.",
  "sim.title": "Trial world",
  "sim.note": "Made-up rounds to try every rule quickly. Separate save. Nothing here is real or settled.",
  "sim.active": "+1 busy round",
  "sim.rest": "+6 resting rounds",
  "sim.day": "+1 day",
  "sim.reset": "Reset trial",
  "sim.resetConfirm": "Start the trial world over?",
  "help.title": "How it works",
  "help.1": "One settled SqueekCore batch on Sepolia is one turn. Each one pays once: replaying, refreshing or reconnecting never pays it again.",
  "help.2": "Busy rounds give data beans and steps. Resting rounds give dream dew and grow the night-only plants. Resting never costs anything.",
  "help.3": "Work that is measured but not settled shows as “on the way” until SqueekCore settles it.",
  "help.4": "Read only: no wallet, no keys, no transactions. Your save stays in this app on this device.",
  "help.5": "Data beans are free and stay in this app. They can't be bought, sold or swapped for any token.",
  "save.export": "Export save",
  "save.import": "Import save",
  "save.imported": "Save imported.",
  "save.badImport": "That file isn't a Squeek Pet World save.",
  "toast.done": "Done",
  "time.days": "{d}d {h}h",
  "time.hours": "{h}h {m}m",
  "time.minutes": "{m}m",
  "log.empty": "Nothing has happened yet.",
  "log.note": "Every settled SqueekCore batch is one entry. Resting rounds in a row share one.",
  "log.more": "Show older entries ({n})",
  "log.round": "Round {n}",
  "log.rounds": "Rounds {from}–{to}",
  "log.tx": "Settlement on Sepolia",
  "log.trial": "Trial",
  "sync.added": "{n} new settled turns",
  "sync.now": "Sync now",
  "bag.seeds": "Seed packets",
  "bag.items": "Gear and supplies",
  "bag.empty": "None yet",
  "live.title": "The real Squeektoshi",
  "live.note": "Live from Squeekchain. The world moves only when SqueekCore settles a round.",
  "lang.label": "Language",
  "guild.plan": "Battle plan",
  "guild.mood": "Boss mood",
  "guild.chance": "Chance",
  "mode.label": "World",
  "confirm.ok": "OK",
  "confirm.cancel": "Cancel",
  "save.title": "Your save",
  "save.exportNote": "Copy this text and keep it somewhere safe. Importing it brings this world back.",
  "save.importNote": "Paste a save exported from Squeek Pet World. It replaces the {world} on this device.",
  "save.copy": "Copy",
  "save.copied": "Copied",
  "save.load": "Import",
  "save.close": "Close",
  "open.world": "Open Squeek Pet World",
  "pet.ripe": "{n} ready to pick",
  "pet.trail": "On the trail, {pct}%",
  "pet.chest": "Chest to open",
  "pet.beans": "{n} data beans",
  "pet.more": "(+{n} more)",
};

type UiKey = keyof typeof en;

const zh: Record<UiKey, string> = {
  "app.title": "Squeek Pet World",
  "app.tagline": "跟着真实仓鼠一起长大的小世界。",
  "mode.real": "真实世界",
  "mode.sim": "试玩世界",
  "badge.live": "实时 · SEPOLIA",
  "badge.trial": "试玩 · 模拟数据",
  "sync.settled": "已结算到第 {n} 轮",
  "sync.syncing": "正在读取结算…",
  "sync.ago": "{ago}同步",
  "sync.never": "还没同步",
  "sync.error": "暂时连不上 Squeekchain，显示的是上次的存档。",
  "sync.busy": "Squeekchain 有点忙，稍后自动重试。",
  "sync.founding": "正在以最新结算的回合建立你的世界…",
  "sync.reorg": "Sepolia 替换了一笔最近的结算，世界已重新回放，每个回合仍只计一次。",
  "sync.retry": "重试",
  "live.running": "Squeektoshi 正在跑 · {rpm} RPM",
  "live.resting": "Squeektoshi 在休息 · 收集梦露",
  "live.offline": "暂时没有跑轮实时数据",
  "live.labelled": "{label}数据",
  "pending.title": "在路上",
  "pending.body": "已经测到但还没结算的工作量：{n} 个单位（约 {beans} 颗数据豆）。SqueekCore 在 Sepolia 上结算后才会计入。",
  "pending.none": "目前测到的运动量都已结算。",
  "res.title": "背包",
  "tab.home": "家园",
  "tab.adventure": "探险",
  "tab.log": "日志",
  "tab.guild": "公会",
  "home.beds": "菜地",
  "home.bed": "第 {n} 块地",
  "home.empty": "空地",
  "home.plant": "种下",
  "home.harvest": "收获",
  "home.clear": "铲掉",
  "home.clearConfirm": "铲掉这株{plant}吗？已经长的进度会丢失。",
  "home.growth": "已长 {pct}%",
  "home.ripe": "成熟啦！",
  "home.growsOn.work": "跑步时生长",
  "home.growsOn.rest": "休息时生长",
  "home.growsOn.both": "日夜都长",
  "home.pick": "第 {n} 块地种什么？",
  "home.cancel": "取消",
  "home.seedPackets": "{n} 包",
  "home.seedRes": "背包里有 {n} 颗",
  "home.onlyIn": "只能种在{area}",
  "home.yields": "收获 {items}",
  "home.buildings": "建筑",
  "home.build": "建造",
  "home.upgrade": "升级",
  "home.level": "{n} 级",
  "home.max": "已满级",
  "home.notBuilt": "未建造",
  "home.areas": "地图",
  "home.unlock": "解锁",
  "home.unlocked": "已解锁",
  "home.needsPrevious": "先解锁{area}",
  "home.craft": "工坊与储藏室",
  "home.make": "制作",
  "home.owned": "已拥有",
  "home.have": "有 {n} 个",
  "home.needsWorkshop": "需要工坊",
  "home.lockedArea": "未解锁",
  "adv.current": "正在探险",
  "adv.progress": "{steps} / {length} 步",
  "adv.stop": "第 {n} 站",
  "adv.treasure": "宝藏",
  "adv.forkTitle": "第二站之后有个岔路口",
  "adv.forkChosen": "路线：{path}",
  "adv.safe": "稳妥小路",
  "adv.safeNote": "危险少一些。",
  "adv.risky": "冒险近道",
  "adv.riskyNote": "危险加倍，收获也加倍。",
  "adv.recall": "召回",
  "adv.recallConfirm": "现在结束这趟探险吗？已经找到的东西都会留下，但终点的宝藏就拿不到了。",
  "adv.found": "目前收获",
  "adv.nothingYet": "还没有",
  "adv.carrying": "携带",
  "adv.plan": "规划一次探险",
  "adv.gear": "装备（最多 {n} 件）",
  "adv.extras": "补给",
  "adv.depart": "出发",
  "adv.needArea": "先解锁{area}",
  "adv.steps": "{n} 步",
  "adv.hazards": "险境",
  "adv.hazard.dark": "黑暗（提灯）",
  "adv.hazard.cliff": "攀爬（绳索）",
  "adv.done": "完成 {n} 次",
  "adv.how": "每 1 个已结算的工作单位 = 1 步。Squeektoshi 休息时，探险队就扎营。路上遇到什么，由每笔结算自己的区块哈希决定。",
  "adv.people": "路上遇到的伙伴",
  "adv.metTimes": "遇到 {n} 次",
  "adv.notMet": "还没遇到",
  "adv.noGear": "先去家园的工坊做装备吧。",
  "adv.none": "无",
  "guild.season": "第 {n} 季",
  "guild.endsIn": "还剩 {time}",
  "guild.boss": "本周 Boss",
  "guild.hp": "{left} / {hp} 血量",
  "guild.defeated": "已击败！本季所有宝箱升一级。",
  "guild.shared": "所有人看到的是同一个 Boss：它的血量随真实仓鼠本周已结算的运动量、Squeekchain 上真实的社区活动，以及仓鼠达成的里程碑一起下降。",
  "guild.fromHamster": "仓鼠",
  "guild.fromCommunity": "社区",
  "guild.fromMilestones": "里程碑",
  "guild.actions": "{n} 次链上行动 · 上限 {cap}",
  "guild.milestones": "{n} 个里程碑 · 上限 {cap}",
  "guild.full": "份额已满：血量的 {pct}%",
  "guild.settledWork": "本季已结算的运动量",
  "guild.caps": "社区活动最多打掉它 {community}% 的血量，里程碑最多 {milestones}%，所以至少一半要靠仓鼠自己已结算的运动量。",
  "guild.waitBoss": "正在读取第 {n} 季 Boss 的结果……",
  "guild.loading": "正在读取本周结算…",
  "guild.unknown": "暂时读不到本周数据。",
  "guild.partial": "部分社区数据没读到，实际伤害可能更高。",
  "guild.simBoss": "试玩 Boss：只计算试玩世界里的模拟运动量。",
  "guild.join": "加入公会",
  "guild.joinFor": "加入第 {n} 季",
  "guild.joinNext": "预选下一季的公会",
  "guild.member": "{guild} · 第 {n} 季",
  "guild.notMember": "本季还没加入公会。加入后才能打 Boss、拿赛季宝箱。",
  "guild.next": "下一季：{guild}",
  "guild.perk": "加成",
  "guild.class": "职业",
  "guild.action": "每个结算回合的行动",
  "guild.actionNote": "Boss 的心情由每笔结算的区块哈希决定，谁也没法提前知道。选一个平均效果最好的。",
  "guild.vs": "对{stance}",
  "guild.moods": "Boss 心情概率",
  "guild.moodsLocked": "盖好观星台，就能看到 Boss 的心情概率。",
  "guild.contribution": "你的贡献",
  "guild.watch": "休息回合算守夜：每轮 +{n}。",
  "guild.chest": "赛季宝箱",
  "guild.chestNow": "当前：{chest}",
  "guild.chestNone": "还没有宝箱",
  "guild.chestNext": "再贡献 {n} 可得{chest}",
  "guild.chestTop": "已达最高档",
  "guild.chestOpensAfter": "赛季结束后才能打开。",
  "guild.open": "打开第 {n} 季宝箱",
  "guild.hits": "已战斗 {n} 个回合",
  "guild.noLeaderboard": "没有排行榜：比较玩家需要服务器，而 Squeek Pet 的一切都只存在你的设备上。",
  "sim.title": "试玩世界",
  "sim.note": "用模拟回合快速体验所有规则。单独存档，这里的一切都不是真实结算的数据。",
  "sim.active": "+1 跑步回合",
  "sim.rest": "+6 休息回合",
  "sim.day": "+1 天",
  "sim.reset": "重置试玩",
  "sim.resetConfirm": "要重新开始试玩世界吗？",
  "help.title": "玩法说明",
  "help.1": "SqueekCore 在 Sepolia 上每结算一批，就是一个回合。每个回合只发一次奖励：重放、刷新、断线重连都不会重复发。",
  "help.2": "跑步回合产出数据豆和探险步数；休息回合产出梦露，让夜间植物生长。休息永远不会扣东西。",
  "help.3": "已经测到但还没结算的运动量会显示为“在路上”，结算后才真正计入。",
  "help.4": "只读：不连钱包、不碰私钥、不发交易。存档只保存在这台设备的应用里。",
  "help.5": "数据豆是免费的，只存在这个应用里，不能购买、出售，也不能换成任何代币。",
  "save.export": "导出存档",
  "save.import": "导入存档",
  "save.imported": "存档已导入。",
  "save.badImport": "这不是 Squeek Pet World 的存档文件。",
  "toast.done": "完成",
  "time.days": "{d} 天 {h} 小时",
  "time.hours": "{h} 小时 {m} 分",
  "time.minutes": "{m} 分钟",
  "log.empty": "还什么都没发生。",
  "log.note": "SqueekCore 每结算一批就是一条记录，连续的休息回合合成一条。",
  "log.more": "显示更早的记录（{n} 条）",
  "log.round": "第 {n} 轮",
  "log.rounds": "第 {from}–{to} 轮",
  "log.tx": "Sepolia 上的结算",
  "log.trial": "试玩",
  "sync.added": "新结算了 {n} 个回合",
  "sync.now": "立即同步",
  "bag.seeds": "种子包",
  "bag.items": "装备和补给",
  "bag.empty": "还没有",
  "live.title": "真实的 Squeektoshi",
  "live.note": "实时来自 Squeekchain。只有 SqueekCore 结算了回合，世界才会前进。",
  "lang.label": "语言",
  "guild.plan": "作战计划",
  "guild.mood": "Boss 心情",
  "guild.chance": "概率",
  "mode.label": "世界",
  "confirm.ok": "确定",
  "confirm.cancel": "取消",
  "save.title": "存档",
  "save.exportNote": "复制这段文字并妥善保存，导入它就能恢复这个世界。",
  "save.importNote": "粘贴从 Squeek Pet World 导出的存档，它会替换这台设备上的{world}。",
  "save.copy": "复制",
  "save.copied": "已复制",
  "save.load": "导入",
  "save.close": "关闭",
  "open.world": "打开 Squeek Pet World",
  "pet.ripe": "{n} 株可以收获",
  "pet.trail": "探险中 {pct}%",
  "pet.chest": "有宝箱可开",
  "pet.beans": "{n} 数据豆",
  "pet.more": "（另有 {n} 条）",
};

export type { UiKey };

const UI: Record<Language, Record<UiKey, string>> = { en, zh };

export function ui(lang: Language, key: UiKey, values: Record<string, string | number> = {}): string {
  const template = UI[lang][key] ?? en[key];
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = values[name];
    if (value === undefined) return match;
    return typeof value === "number" ? num(lang, value) : value;
  });
}

const EN_ERRORS: Record<string, string> = {
  "err.plot": "That bed isn't there.",
  "err.plotBusy": "Something is already growing there.",
  "err.plantArea": "That plant can't grow in this area.",
  "err.noSeed": "No seeds for that.",
  "err.notRipe": "Not ripe yet.",
  "err.unknown": "That isn't something you can do.",
  "err.locked": "Unlock that area first.",
  "err.maxLevel": "Already at the top level.",
  "err.cost": "Not enough in the bag.",
  "err.unlocked": "Already unlocked.",
  "err.previousArea": "Unlock the area before it first.",
  "err.workshop": "Build the workshop first.",
  "err.owned": "You already have one.",
  "err.full": "The bag can't hold more of those.",
  "err.onTrail": "Already on an expedition.",
  "err.gear": "Check the gear: only pieces you own, and no more than your gear slots.",
  "err.cottage": "Upgrade the cottage first: no building can be a higher level than the cottage.",
  "err.noTrip": "Not on an expedition.",
  "err.forkPassed": "The fork is already behind.",
  "err.season": "You can join this season or the next one.",
  "err.joined": "Already in a guild for that season.",
  "err.seasonOpen": "That season isn't over yet.",
  "err.opened": "Already opened.",
  "err.noChest": "Not enough contribution for a chest.",
};

const ZH_ERRORS: Record<string, string> = {
  "err.plot": "没有这块地。",
  "err.plotBusy": "这块地已经种了东西。",
  "err.plantArea": "这种植物不能种在这个区域。",
  "err.noSeed": "没有这种种子。",
  "err.notRipe": "还没成熟。",
  "err.unknown": "不能这样做。",
  "err.locked": "需要先解锁这个区域。",
  "err.maxLevel": "已经是最高级了。",
  "err.cost": "背包里的东西不够。",
  "err.unlocked": "已经解锁了。",
  "err.previousArea": "需要先解锁前一个区域。",
  "err.workshop": "需要先盖好工坊。",
  "err.owned": "已经有一个了。",
  "err.full": "背包放不下更多了。",
  "err.onTrail": "已经在探险中了。",
  "err.gear": "检查一下装备：只能带已拥有的，而且不能超过装备栏。",
  "err.cottage": "先升级小屋：其他建筑的等级不能超过小屋。",
  "err.noTrip": "现在没有在探险。",
  "err.forkPassed": "已经过了岔路口。",
  "err.season": "只能加入本季或下一季。",
  "err.joined": "那一季已经加入公会了。",
  "err.seasonOpen": "这一季还没结束。",
  "err.opened": "已经打开过了。",
  "err.noChest": "贡献还不够开宝箱。",
};

export function errorText(lang: Language, key: string): string {
  return (lang === "zh" ? ZH_ERRORS : EN_ERRORS)[key] ?? EN_ERRORS[key] ?? key;
}

export const ERROR_KEYS = Object.keys(EN_ERRORS);

/** "2d 5h", "3h 12m", "45m". */
export function duration(lang: Language, ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  if (d > 0) return ui(lang, "time.days", { d: String(d), h: String(h) });
  if (h > 0) return ui(lang, "time.hours", { h: String(h), m: String(m) });
  return ui(lang, "time.minutes", { m: String(m) });
}

export function plantName(lang: Language, id: PlantId) {
  return PLANTS[id].name[lang];
}

export function resourceName(lang: Language, id: ResourceId) {
  return RESOURCE_NAMES[id][lang];
}

export function npcName(lang: Language, id: keyof typeof NPCS) {
  return NPCS[id].name[lang];
}
