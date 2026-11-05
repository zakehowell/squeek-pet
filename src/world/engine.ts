import {
  AREAS,
  AREA_ORDER,
  BEANS_PER_WORK,
  BUILDINGS,
  CHEST_TIERS,
  CLASSES,
  DEW_PER_REST,
  DIARY_LIMIT,
  EFFECT,
  FORK_NODE,
  GEAR,
  ITEMS,
  MAX_GEAR,
  NEWS_LIMIT,
  NIGHT_WATCH,
  NODES,
  PLANTS,
  REST_ENTRY_ROUNDS,
  REST_GROWTH,
  ROUTES,
  START_RESOURCES,
  START_SEEDS,
  WELL_REST_BONUS,
  WORKSHOP_DISCOUNT,
  emptyResources,
  nodeSteps,
  type ChestTier,
  type Cost,
  type RouteEvent,
} from "./data";
import { rng, variant, type Rng } from "./rng";
import { bossOf, seasonOf, stanceFor } from "./season";
import type {
  AreaId,
  BuildingId,
  Choice,
  ChoiceRecord,
  DiaryEntry,
  Gap,
  GearId,
  GuildId,
  ItemId,
  LedgerEntry,
  Line,
  NpcId,
  PlantId,
  Plot,
  ResourceId,
  Turn,
  WorldState,
} from "./types";

// The rules. `replay` folds the settled turns and the player's choices into a
// world; nothing here reads the clock or the network, so the same logs always
// give the same world. Rewards come only from settled turns, once each.

export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function plotsFor(area: AreaId): Plot[] {
  const spec = AREAS.find((a) => a.id === area)!;
  return Array.from({ length: spec.plots }, () => ({ area, plant: null, growth: 0 }));
}

export function newWorld(origin: number, created: number, sim = false): WorldState {
  const seeds = { carrot: 0, sunflower: 0, clover: 0, blueberry: 0, lily: 0, moonflower: 0, ...START_SEEDS };
  const world: WorldState = {
    v: 1,
    origin,
    created,
    frontier: origin,
    lastAt: 0,
    turns: 0,
    res: { ...emptyResources(), ...START_RESOURCES },
    seeds,
    items: { lamp: 0, rope: 0, map: 0, trowel: 0, snack: 0, charm: 0 },
    plots: plotsFor("meadow"),
    areas: ["meadow"],
    buildings: { cottage: 1 },
    expedition: null,
    routesDone: {},
    guild: { guild: null, season: 0, next: null, cls: "ranger", action: "strike", contribution: {}, chests: [], hits: 0 },
    diary: [],
    news: [],
    stats: { work: 0, activeTurns: 0, restTurns: 0, restRounds: 0, harvests: 0, steps: 0, builds: 0, expeditions: 0, npcs: {} },
    dust: 0,
  };
  world.diary.push({
    id: `start:${origin}`,
    kind: "start",
    from: origin,
    to: origin,
    at: created,
    rounds: 0,
    work: 0,
    blocks: 0,
    seed: `start:${origin}`,
    tx: null,
    lines: [{ k: "d.start", v: { to: origin } }],
    sim,
  });
  return world;
}

/** The world's clock: the last settlement's time, or the founding time before the first one. */
export const clockOf = (world: WorldState) => Math.max(world.created, world.lastAt);

export const currentSeason = (world: WorldState) => seasonOf(clockOf(world));

/** The guild the player belongs to for `season`: this season's, or the one signed up for next. */
export function guildFor(world: WorldState, season: number): GuildId | null {
  const state = world.guild;
  if (state.guild && state.season === season) return state.guild;
  if (state.next && state.next.season === season) return state.next.guild;
  return null;
}

/** Once its season has begun, a sign-up for next season becomes the guild the player is in. */
function rollGuild(world: WorldState, season: number) {
  const next = world.guild.next;
  if (!next || next.season > season) return;
  world.guild.guild = next.guild;
  world.guild.season = next.season;
  world.guild.next = null;
}

/** True while the player belongs to `guild` for the season of `at`. */
export function hasPerk(world: WorldState, guild: GuildId, at = clockOf(world)): boolean {
  return guildFor(world, seasonOf(at)) === guild;
}

// ---- Costs -----------------------------------------------------------------

export function priceOf(world: WorldState, cost: Cost, discounted: boolean): Cost {
  if (!discounted || !cost.beans || !hasPerk(world, "cog")) return cost;
  return { ...cost, beans: Math.floor((cost.beans * 90) / 100) };
}

export function affordable(world: WorldState, cost: Cost): boolean {
  return (Object.keys(cost) as ResourceId[]).every((key) => world.res[key] >= (cost[key] ?? 0));
}

function pay(world: WorldState, cost: Cost) {
  for (const key of Object.keys(cost) as ResourceId[]) world.res[key] -= cost[key] ?? 0;
}

function gain(world: WorldState, cost: Cost) {
  for (const key of Object.keys(cost) as ResourceId[]) world.res[key] += cost[key] ?? 0;
}

/** "wood:12,stone:8,seed.carrot:1": a reward list the diary can render in any language. */
export function rewardList(cost: Cost, seeds: Partial<Record<PlantId, number>> = {}): string {
  const parts = (Object.keys(cost) as ResourceId[]).filter((k) => (cost[k] ?? 0) > 0).map((k) => `${k}:${cost[k]}`);
  for (const plant of Object.keys(seeds) as PlantId[]) if ((seeds[plant] ?? 0) > 0) parts.push(`seed.${plant}:${seeds[plant]}`);
  return parts.join(",");
}

export function nextLevelCost(world: WorldState, id: BuildingId): Cost | null {
  const level = world.buildings[id] ?? 0;
  const spec = BUILDINGS[id];
  return level < spec.levels.length ? priceOf(world, spec.levels[level], true) : null;
}

export function areaCost(world: WorldState, area: AreaId): Cost {
  return priceOf(world, AREAS.find((a) => a.id === area)!.cost, true);
}

/** What making an item costs now: gear is 25% cheaper with a level 2 workshop. */
export function craftCost(world: WorldState, item: ItemId): Cost {
  const spec = ITEMS[item];
  if (!spec.workshop || (world.buildings.workshop ?? 0) < 2) return spec.cost;
  const cost: Cost = {};
  for (const key of Object.keys(spec.cost) as ResourceId[]) cost[key] = Math.ceil(((spec.cost[key] ?? 0) * WORKSHOP_DISCOUNT) / 100);
  return cost;
}

/** How much gear an expedition can carry: one more piece with a level 3 workshop. */
export const gearSlots = (world: WorldState) => MAX_GEAR + ((world.buildings.workshop ?? 0) >= 3 ? 1 : 0);

/** No building can be a higher level than the cottage. */
export const cottageAllows = (world: WorldState, id: BuildingId) =>
  id === "cottage" || (world.buildings[id] ?? 0) + 1 <= (world.buildings.cottage ?? 1);

export function chestTier(contribution: number, bossDefeated: boolean): ChestTier | null {
  let index = -1;
  CHEST_TIERS.forEach((tier, i) => {
    if (contribution >= tier.min) index = i;
  });
  if (index < 0) return null;
  if (bossDefeated) index = Math.min(CHEST_TIERS.length - 1, index + 1);
  return CHEST_TIERS[index];
}

// ---- Choices ---------------------------------------------------------------

/** Why a choice can't be made now, as a message key, or null when it can. */
export function check(world: WorldState, choice: Choice): string | null {
  switch (choice.t) {
    case "plant": {
      const plot = world.plots[choice.plot];
      if (!plot) return "err.plot";
      if (plot.plant) return "err.plotBusy";
      const spec = PLANTS[choice.plant];
      if (!spec) return "err.plot";
      if (spec.area && spec.area !== plot.area) return "err.plantArea";
      if (spec.seedFrom === "packet" ? world.seeds[choice.plant] < 1 : world.res[spec.seedFrom] < 1) return "err.noSeed";
      return null;
    }
    case "harvest": {
      const plot = world.plots[choice.plot];
      if (!plot?.plant) return "err.plot";
      return plot.growth >= PLANTS[plot.plant].need ? null : "err.notRipe";
    }
    case "clear":
      return world.plots[choice.plot]?.plant ? null : "err.plot";
    case "build": {
      const spec = BUILDINGS[choice.building];
      if (!spec) return "err.unknown";
      if (!world.areas.includes(spec.area)) return "err.locked";
      const cost = nextLevelCost(world, choice.building);
      if (!cost) return "err.maxLevel";
      if (!cottageAllows(world, choice.building)) return "err.cottage";
      return affordable(world, cost) ? null : "err.cost";
    }
    case "unlock": {
      const index = AREA_ORDER.indexOf(choice.area);
      if (index < 1) return "err.unknown";
      if (world.areas.includes(choice.area)) return "err.unlocked";
      if (!world.areas.includes(AREA_ORDER[index - 1])) return "err.previousArea";
      return affordable(world, areaCost(world, choice.area)) ? null : "err.cost";
    }
    case "craft": {
      const spec = ITEMS[choice.item];
      if (!spec) return "err.unknown";
      if (spec.workshop && !world.buildings.workshop) return "err.workshop";
      if (!spec.consumable && world.items[choice.item] > 0) return "err.owned";
      if (spec.consumable && world.items[choice.item] >= 9) return "err.full";
      return affordable(world, craftCost(world, choice.item)) ? null : "err.cost";
    }
    case "expedition": {
      if (world.expedition) return "err.onTrail";
      const route = ROUTES[choice.route];
      if (!route) return "err.unknown";
      if (!world.areas.includes(route.area)) return "err.locked";
      if (choice.gear.length > gearSlots(world) || new Set(choice.gear).size !== choice.gear.length) return "err.gear";
      if (choice.gear.some((g) => !GEAR.includes(g) || world.items[g] < 1)) return "err.gear";
      if (choice.snack && world.items.snack < 1) return "err.gear";
      if (choice.charm && world.items.charm < 1) return "err.gear";
      return null;
    }
    case "fork": {
      const trip = world.expedition;
      if (!trip) return "err.noTrip";
      return trip.node <= FORK_NODE ? null : "err.forkPassed";
    }
    case "recall":
      return world.expedition ? null : "err.noTrip";
    case "guild": {
      if (!(choice.guild in CLASSES_BY_GUILD)) return "err.unknown";
      const season = currentSeason(world);
      if (choice.season < season || choice.season > season + 1) return "err.season";
      if (guildFor(world, choice.season)) return "err.joined";
      return null;
    }
    case "class":
      return CLASSES[choice.cls] ? null : "err.unknown";
    case "action":
      return choice.action in EFFECT ? null : "err.unknown";
    case "chest": {
      if (choice.season >= currentSeason(world)) return "err.seasonOpen";
      if (world.guild.chests.includes(choice.season)) return "err.opened";
      return chestTier(world.guild.contribution[choice.season] ?? 0, false) ? null : "err.noChest";
    }
  }
}

const CLASSES_BY_GUILD: Record<GuildId, true> = { seed: true, lantern: true, cog: true, star: true };

function eventEntry(world: WorldState, lines: Line[], key: string): DiaryEntry {
  return {
    id: `event:${world.frontier}:${key}:${world.diary.length}`,
    kind: "event",
    from: world.frontier,
    to: world.frontier,
    at: clockOf(world),
    rounds: 0,
    work: 0,
    blocks: 0,
    seed: `event:${world.frontier}:${key}`,
    tx: null,
    lines,
  };
}

function note(world: WorldState, key: string, lines: Line[]) {
  pushDiary(world, eventEntry(world, lines, key));
}

/** Applies a choice if the rules allow it. Returns the reason when they don't. */
export function applyChoice(world: WorldState, choice: Choice): string | null {
  const error = check(world, choice);
  if (error) return error;
  rollGuild(world, currentSeason(world));
  switch (choice.t) {
    case "plant": {
      const spec = PLANTS[choice.plant];
      if (spec.seedFrom === "packet") world.seeds[choice.plant] -= 1;
      else world.res[spec.seedFrom] -= 1;
      world.plots[choice.plot] = { ...world.plots[choice.plot], plant: choice.plant, growth: 0 };
      break;
    }
    case "harvest": {
      const plot = world.plots[choice.plot];
      const spec = PLANTS[plot.plant!];
      gain(world, spec.yields);
      world.seeds[spec.id] += spec.seedBack;
      world.plots[choice.plot] = { ...plot, plant: null, growth: 0 };
      world.stats.harvests += 1;
      break;
    }
    case "clear":
      world.plots[choice.plot] = { ...world.plots[choice.plot], plant: null, growth: 0 };
      break;
    case "build": {
      pay(world, nextLevelCost(world, choice.building)!);
      const level = (world.buildings[choice.building] ?? 0) + 1;
      world.buildings[choice.building] = level;
      world.stats.builds += 1;
      note(world, `build.${choice.building}`, [{ k: "d.event.build", v: { building: choice.building, n: level } }]);
      break;
    }
    case "unlock":
      pay(world, areaCost(world, choice.area));
      world.areas.push(choice.area);
      world.plots.push(...plotsFor(choice.area));
      note(world, `unlock.${choice.area}`, [{ k: "d.event.unlock", v: { area: choice.area } }]);
      break;
    case "craft":
      pay(world, craftCost(world, choice.item));
      world.items[choice.item] += 1;
      break;
    case "expedition":
      if (choice.snack) world.items.snack -= 1;
      if (choice.charm) world.items.charm -= 1;
      world.expedition = {
        route: choice.route,
        steps: 0,
        node: 0,
        gear: [...choice.gear],
        snack: choice.snack,
        charm: choice.charm,
        fork: null,
        found: {},
        since: world.frontier + 1,
      };
      note(world, `trip.${choice.route}`, [{ k: "d.event.depart", v: { route: choice.route, gear: choice.gear.join(",") } }]);
      break;
    case "fork":
      world.expedition!.fork = choice.path;
      break;
    case "recall": {
      const trip = world.expedition!;
      if (trip.charm) world.items.charm += 1;
      world.expedition = null;
      note(world, `recall.${trip.route}`, [{ k: "d.event.recall", v: { route: trip.route } }]);
      break;
    }
    case "guild":
      if (choice.season === currentSeason(world)) {
        world.guild.guild = choice.guild;
        world.guild.season = choice.season;
      } else {
        world.guild.next = { guild: choice.guild, season: choice.season };
      }
      note(world, `guild.${choice.season}`, [{ k: "d.event.guild", v: { guild: choice.guild, season: choice.season } }]);
      break;
    case "class":
      world.guild.cls = choice.cls;
      break;
    case "action":
      world.guild.action = choice.action;
      break;
    case "chest": {
      const tier = chestTier(world.guild.contribution[choice.season] ?? 0, choice.bossDefeated)!;
      gain(world, tier.reward);
      for (const plant of Object.keys(tier.seeds) as PlantId[]) world.seeds[plant] += tier.seeds[plant] ?? 0;
      world.guild.chests.push(choice.season);
      note(world, `chest.${choice.season}`, [
        { k: "d.event.chest", v: { chest: tier.id, season: choice.season, items: rewardList(tier.reward, tier.seeds) } },
      ]);
      break;
    }
  }
  return null;
}

// ---- Turns -----------------------------------------------------------------

function pushDiary(world: WorldState, entry: DiaryEntry) {
  world.diary.push(entry);
  if (world.diary.length > DIARY_LIMIT) world.diary.splice(0, world.diary.length - DIARY_LIMIT);
}

function pushNews(world: WorldState, turn: Turn, lines: Line[]) {
  if (!lines.length) return;
  world.news.push({ turn: turn.id, to: turn.to, lines });
  if (world.news.length > NEWS_LIMIT) world.news.splice(0, world.news.length - NEWS_LIMIT);
}

const percent = (value: number, pct: number) => Math.floor((value * pct) / 100);

function growPlants(world: WorldState, turn: Turn, rest: number, lines: Line[], news: Line[]) {
  const grown: PlantId[] = [];
  const windmill = (world.buildings.windmill ?? 0) * 10;
  const well = (world.buildings.well ?? 0) * WELL_REST_BONUS;
  const guild = hasPerk(world, "seed", turn.at) ? 10 : 0;
  world.plots.forEach((plot, index) => {
    if (!plot.plant) return;
    const spec = PLANTS[plot.plant];
    if (plot.growth >= spec.need) return;
    let fromWork = spec.grows === "rest" ? 0 : turn.work;
    let fromRest = spec.grows === "work" ? 0 : rest * (REST_GROWTH + well);
    fromWork += percent(fromWork, windmill + guild);
    fromRest += percent(fromRest, guild);
    const growth = fromWork + fromRest;
    if (growth <= 0) return;
    const before = plot.growth;
    plot.growth = Math.min(spec.need, plot.growth + growth);
    if (plot.growth >= spec.need && before < spec.need) {
      const line = { k: "d.garden.ripe", v: { plant: plot.plant, n: index + 1 } };
      lines.push(line);
      news.push(line);
    } else if (!grown.includes(plot.plant)) {
      grown.push(plot.plant);
    }
  });
  if (grown.length) lines.push({ k: "d.garden.grow", v: { plants: grown.join(","), _: variant(`${turn.seed}:grow`, 3) } });
}

function resolveNode(world: WorldState, turn: Turn, node: number, lines: Line[], news: Line[]) {
  const trip = world.expedition!;
  const route = ROUTES[trip.route];
  const roll = rng(`${turn.seed}:node:${trip.route}:${node}`);
  const risky = node > FORK_NODE && trip.fork === "risky";
  const extra = trip.gear.includes("trowel") ? 1 : 0;
  const found = (res: ResourceId, n: number) => {
    world.res[res] += n;
    trip.found[res] = (trip.found[res] ?? 0) + n;
  };
  if (node === FORK_NODE) {
    const path = trip.fork ?? "safe";
    trip.fork = path;
    lines.push({ k: "d.adv.fork", v: { path, route: trip.route } });
  }
  // Risky paths meet more hazards and find twice as much.
  const events = route.events.map(({ weight, event }) => ({
    weight: risky && event.kind === "hazard" ? weight * 2 : weight,
    value: event,
  }));
  const event: RouteEvent = roll.weighted(events);
  const double = risky ? 2 : 1;
  switch (event.kind) {
    case "find": {
      const amount = (roll.int(event.min, event.max) + extra) * double;
      found(event.res, amount);
      lines.push({ k: "d.adv.find", v: { res: event.res, n: amount, _: variant(`${turn.seed}:find`, 3) } });
      break;
    }
    case "seed": {
      const amount = (event.count + (extra ? 1 : 0)) * double;
      world.seeds[event.plant] += amount;
      const line = { k: "d.adv.seed", v: { plant: event.plant, n: amount } };
      lines.push(line);
      news.push(line);
      break;
    }
    case "npc":
      meetNpc(world, turn, event.npc, roll, double, lines, news);
      break;
    case "hazard": {
      const need: GearId = event.hazard === "dark" ? "lamp" : "rope";
      if (trip.gear.includes(need)) {
        lines.push({ k: "d.adv.hazard.gear", v: { place: event.place, item: need } });
        found(event.hazard === "dark" ? "crystal" : "wood", event.hazard === "dark" ? 1 : 3);
      } else if (trip.charm) {
        trip.charm = false;
        lines.push({ k: "d.adv.hazard.charm", v: { place: event.place } });
      } else {
        const floor = nodeSteps(route.length, node) - Math.round(route.length / NODES);
        const setback = Math.min(Math.round(route.length / 10), Math.max(0, trip.steps - floor));
        trip.steps -= setback;
        const line = { k: "d.adv.hazard.fail", v: { place: event.place, item: need, steps: setback } };
        lines.push(line);
        news.push(line);
      }
      break;
    }
  }
}

function meetNpc(world: WorldState, turn: Turn, npc: NpcId, roll: Rng, double: number, lines: Line[], news: Line[]) {
  const trip = world.expedition!;
  world.stats.npcs[npc] = (world.stats.npcs[npc] ?? 0) + 1;
  const add = (res: ResourceId, n: number) => {
    world.res[res] += n;
    trip.found[res] = (trip.found[res] ?? 0) + n;
  };
  let line: Line;
  switch (npc) {
    case "owl": {
      const plant = roll.pick<PlantId>(world.areas.includes("lake") ? ["clover", "blueberry", "lily"] : ["clover", "blueberry", "carrot"]);
      const n = 2 * double;
      world.seeds[plant] += n;
      line = { k: "d.npc.owl", v: { plant, n, _: variant(`${turn.seed}:owl`, 2) } };
      break;
    }
    case "frog": {
      if (world.res.clover > 0) {
        world.res.clover -= 1;
        add("crystal", 1 * double);
        line = { k: "d.npc.frog.clover", v: { n: double } };
      } else if (roll.chance(50)) {
        add("dew", 15 * double);
        line = { k: "d.npc.frog.win", v: { n: 15 * double } };
      } else {
        add("dew", 3);
        line = { k: "d.npc.frog.lose", v: { n: 3 } };
      }
      break;
    }
    case "mole": {
      const stones = roll.int(4, 8) * double;
      add("stone", stones);
      if (trip.gear.includes("lamp")) {
        add("crystal", 1);
        line = { k: "d.npc.mole.lamp", v: { n: stones } };
      } else {
        line = { k: "d.npc.mole", v: { n: stones } };
      }
      break;
    }
    case "firefly": {
      const bonus = Math.round(ROUTES[trip.route].length / 20);
      trip.steps += bonus;
      line = { k: "d.npc.firefly", v: { steps: bonus } };
      break;
    }
    case "crow": {
      if (world.res.stone >= 10) {
        world.res.stone -= 10;
        add("crystal", 1 * double);
        line = { k: "d.npc.crow.trade", v: { n: double } };
      } else {
        add("stone", 2);
        line = { k: "d.npc.crow", v: { n: 2 } };
      }
      break;
    }
    case "hedgehog": {
      const plant = roll.pick<PlantId>(["carrot", "clover"]);
      world.seeds[plant] += 1 * double;
      add("sunseed", 1);
      line = { k: "d.npc.hedgehog", v: { plant, n: double } };
      break;
    }
  }
  lines.push(line);
  news.push(line);
}

function walk(world: WorldState, turn: Turn, rest: number, lines: Line[], news: Line[]) {
  const trip = world.expedition;
  if (!trip) return;
  const route = ROUTES[trip.route];
  if (turn.work <= 0) {
    if (rest > 0) lines.push({ k: "d.adv.camp", v: { route: trip.route, _: variant(`${turn.seed}:camp`, 3) } });
    return;
  }
  const bonus = (trip.gear.includes("map") ? 10 : 0) + (hasPerk(world, "lantern", turn.at) ? 10 : 0) + (trip.snack ? 25 : 0);
  const steps = turn.work + percent(turn.work, bonus);
  trip.steps += steps;
  world.stats.steps += steps;
  const trail = rng(`${turn.seed}:trail:${trip.route}`);
  if (trail.chance(35)) {
    const res = trail.pick(route.trail);
    const amount = trail.int(1, 3);
    world.res[res] += amount;
    trip.found[res] = (trip.found[res] ?? 0) + amount;
    lines.push({ k: "d.adv.trail", v: { res, n: amount } });
  }
  while (trip.node < NODES && trip.steps >= nodeSteps(route.length, trip.node)) {
    if (trip.node === NODES - 1) {
      finishTrip(world, turn, lines, news);
      return;
    }
    resolveNode(world, turn, trip.node, lines, news);
    trip.node += 1;
  }
  lines.push({
    k: "d.adv.steps",
    v: { route: trip.route, steps, pct: Math.min(99, Math.floor((trip.steps * 100) / route.length)) },
  });
}

function finishTrip(world: WorldState, turn: Turn, lines: Line[], news: Line[]) {
  const trip = world.expedition!;
  const route = ROUTES[trip.route];
  gain(world, route.reward);
  for (const plant of Object.keys(route.rewardSeeds) as PlantId[]) world.seeds[plant] += route.rewardSeeds[plant] ?? 0;
  if (trip.charm) world.items.charm += 1;
  world.routesDone[trip.route] = (world.routesDone[trip.route] ?? 0) + 1;
  world.stats.expeditions += 1;
  const line = { k: "d.adv.done", v: { route: trip.route, items: rewardList(route.reward, route.rewardSeeds), _: variant(`${turn.seed}:done`, 2) } };
  lines.push(line);
  news.push(line);
  world.expedition = null;
}

function fight(world: WorldState, turn: Turn, rest: number, lines: Line[]) {
  const season = seasonOf(turn.at);
  const guild = world.guild;
  if (!guildFor(world, season)) return;
  let gained = 0;
  if (turn.work > 0) {
    const stance = stanceFor(turn.seed, season);
    let pct = EFFECT[guild.action][stance];
    const cls = CLASSES[guild.cls];
    let berry = false;
    if (cls.best === guild.action) {
      if (guild.cls === "herbalist" && world.res.berry > 0) {
        world.res.berry -= 1;
        berry = true;
        pct = percent(pct, 160);
      } else if (guild.cls !== "scout") {
        pct = percent(pct, cls.bonus);
      }
    }
    pct += percent(pct, (world.buildings.observatory ?? 0) * 10);
    gained = percent(turn.work, pct);
    guild.hits += 1;
    lines.push({
      k: "d.guild.hit",
      v: { boss: bossOf(season).id, stance, action: guild.action, n: gained, berry: berry ? 1 : 0, _: variant(`${turn.seed}:hit`, 2) },
    });
    if (guild.action === "scavenge") {
      const loot = rng(`${turn.seed}:scavenge`);
      const times = guild.cls === "scout" ? 2 : 1;
      if (loot.chance(15)) {
        world.res.crystal += times;
        lines.push({ k: "d.guild.loot", v: { res: "crystal", n: times } });
      } else if (loot.chance(70)) {
        const res = loot.pick<ResourceId>(["wood", "stone", "carrot", "sunseed"]);
        const amount = loot.int(2, 5) * times;
        world.res[res] += amount;
        lines.push({ k: "d.guild.loot", v: { res, n: amount } });
      }
    }
  }
  if (rest > 0) {
    const watch = rest * NIGHT_WATCH;
    gained += watch;
    if (turn.work <= 0) lines.push({ k: "d.guild.watch", v: { n: watch, boss: bossOf(season).id } });
  }
  guild.contribution[season] = (guild.contribution[season] ?? 0) + gained;
}

function applyGap(world: WorldState, gap: Gap) {
  world.frontier = gap.to;
  world.lastAt = Math.max(world.lastAt, gap.at);
  pushDiary(world, {
    id: gap.id,
    kind: "gap",
    from: gap.from,
    to: gap.to,
    at: gap.at,
    rounds: gap.to - gap.from + 1,
    work: 0,
    blocks: 0,
    seed: gap.id,
    tx: null,
    lines: [{ k: "d.gap", v: { rounds: gap.to - gap.from + 1 } }],
  });
}

export function applyTurn(world: WorldState, entry: LedgerEntry) {
  if (entry.kind === "gap") {
    applyGap(world, entry);
    return;
  }
  const turn = entry;
  rollGuild(world, seasonOf(turn.at));
  const rounds = turn.to - turn.from + 1;
  const rest = Math.max(0, rounds - turn.active);
  world.turns += 1;
  world.frontier = turn.to;
  world.lastAt = Math.max(world.lastAt, turn.at);
  world.stats.work += turn.work;
  world.stats.restRounds += rest;
  if (turn.work > 0) world.stats.activeTurns += 1;
  else world.stats.restTurns += 1;

  // Income: beans from settled work, dew from rest. Nothing for unsettled work.
  const total = world.dust + turn.work;
  let beans = Math.floor(total / BEANS_PER_WORK);
  world.dust = total % BEANS_PER_WORK;
  beans += percent(beans, ((world.buildings.cottage ?? 1) - 1) * 5 + (world.buildings.silo ?? 0) * 10);
  world.res.beans += beans;
  const dewPerRound = DEW_PER_REST + (world.buildings.lantern ?? 0) + (hasPerk(world, "star", turn.at) ? 1 : 0);
  const dew = rest * dewPerRound;
  world.res.dew += dew;

  const lines: Line[] = [];
  const news: Line[] = [];
  // The pier: a 1% chance per resting round for each level, at most one crystal a turn.
  const pier = world.buildings.pier ?? 0;
  if (rest > 0 && pier > 0 && rng(`${turn.seed}:pier`).chance(Math.min(100, pier * rest))) {
    world.res.crystal += 1;
    const line = { k: "d.pier", v: { n: 1 } };
    lines.push(line);
    news.push(line);
  }
  growPlants(world, turn, rest, lines, news);
  walk(world, turn, rest, lines, news);
  fight(world, turn, rest, lines);

  const last = world.diary[world.diary.length - 1];
  if (turn.work <= 0) {
    const mergeable =
      last &&
      last.kind === "rest" &&
      last.to === turn.from - 1 &&
      !!last.sim === !!turn.sim &&
      last.rounds + rounds <= REST_ENTRY_ROUNDS;
    if (mergeable) {
      last.to = turn.to;
      last.rounds += rounds;
      last.at = turn.at;
      last.tx = turn.tx;
      const head = last.lines[0];
      head.v = { ...head.v, rounds: last.rounds, dew: Number(head.v?.dew ?? 0) + dew, to: turn.to };
      for (const line of lines) {
        if (line.k === "d.guild.watch") {
          const watch = last.lines.find((l) => l.k === "d.guild.watch");
          if (watch) watch.v = { ...watch.v, n: Number(watch.v?.n ?? 0) + Number(line.v?.n ?? 0) };
          else last.lines.push(line);
        } else if (line.k !== "d.adv.camp" || !last.lines.some((l) => l.k === "d.adv.camp")) {
          last.lines.push(line);
        }
      }
    } else {
      pushDiary(world, {
        id: turn.id,
        kind: "rest",
        from: turn.from,
        to: turn.to,
        at: turn.at,
        rounds,
        work: 0,
        blocks: 0,
        seed: turn.seed,
        tx: turn.tx,
        lines: [{ k: "d.head.rest", v: { rounds, dew, from: turn.from, to: turn.to } }, ...lines],
        sim: turn.sim,
      });
    }
  } else {
    pushDiary(world, {
      id: turn.id,
      kind: "active",
      from: turn.from,
      to: turn.to,
      at: turn.at,
      rounds,
      work: turn.work,
      blocks: turn.blocks,
      seed: turn.seed,
      tx: turn.tx,
      lines: [{ k: "d.head.active", v: { to: turn.to, work: turn.work, blocks: turn.blocks, beans, rounds } }, ...lines],
      sim: turn.sim,
    });
  }
  pushNews(world, turn, news);
}

// ---- Replay ----------------------------------------------------------------

/**
 * Folds the ledger and the choices into a world, starting from `base`.
 * A choice made while the frontier stood at round F applies after every turn
 * up to F and before the next one, which is exactly what the player saw.
 * Choices the rules reject at that point (after a reorg, say) are skipped.
 */
export function replay(base: WorldState, entries: readonly LedgerEntry[], choices: readonly ChoiceRecord[]): WorldState {
  const world = clone(base);
  const pending = [...choices].sort((a, b) => a.seq - b.seq);
  let next = 0;
  for (const entry of entries) {
    if (entry.to <= world.frontier) continue;
    while (next < pending.length && pending[next].at < entry.from) applyChoice(world, pending[next++].c);
    applyTurn(world, entry);
  }
  while (next < pending.length) applyChoice(world, pending[next++].c);
  return world;
}
