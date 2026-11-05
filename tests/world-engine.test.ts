import { describe, expect, it } from "vitest";
import { BEANS_PER_WORK, CHEST_TIERS, DEW_PER_REST, ITEMS, MAX_GEAR, PLANTS, REST_GROWTH, ROUTES, WELL_REST_BONUS } from "../src/world/data";
import { applyChoice, check, chestTier, clockOf, craftCost, gearSlots, guildFor, hasPerk, newWorld, replay } from "../src/world/engine";
import { seasonEnd, seasonOf, stanceFor } from "../src/world/season";
import { renderLine } from "../src/world/i18n";
import { prune, worldOf, type SaveFile } from "../src/world/store";
import { simTurns } from "../src/world/sim";
import type { Choice, ChoiceRecord, LedgerEntry, Turn } from "../src/world/types";
import { ROUND, T, turn } from "./world-helpers";

const ORIGIN = 100;
const base = () => newWorld(ORIGIN, T);
let seq = 0;
const choice = (at: number, c: Choice): ChoiceRecord => ({ seq: ++seq, at, made: 0, c });

describe("world engine", () => {
  it("pays every settled turn exactly once", () => {
    const entries = [turn(101, 500), turn(102, 0), turn(103, 1234)];
    const world = replay(base(), entries, []);
    expect(world.frontier).toBe(103);
    expect(world.turns).toBe(3);
    expect(world.res.beans).toBe(100 + Math.floor(1734 / BEANS_PER_WORK));
    expect(world.dust).toBe(1734 % BEANS_PER_WORK);
    expect(world.res.dew).toBe(DEW_PER_REST);

    // The same turns again, duplicated or replayed on top, change nothing.
    expect(replay(base(), [...entries, ...entries], [])).toEqual(world);
    expect(replay(world, entries, [])).toEqual(world);
  });

  it("replays to the same world every time", () => {
    const entries = Array.from({ length: 200 }, (_, i) => turn(101 + i, i % 5 === 0 ? 300 + i : 0));
    const choices = [choice(100, { t: "plant", plot: 0, plant: "carrot" }), choice(150, { t: "expedition", route: "mossy", gear: [], snack: false, charm: false })];
    const a = replay(base(), entries, choices);
    const b = replay(base(), entries, choices);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("applies a choice between the turns it was made between", () => {
    const entries = [turn(101, 1000), turn(102, 300)];
    const world = replay(base(), entries, [choice(101, { t: "plant", plot: 0, plant: "carrot" })]);
    // Planted after round 101 settled, so only round 102's work grew it.
    expect(world.plots[0]).toMatchObject({ plant: "carrot", growth: 300 });
    expect(world.seeds.carrot).toBe(1);
  });

  it("skips choices the rules reject without throwing", () => {
    const world = base();
    expect(applyChoice(world, { t: "harvest", plot: 0 })).toBe("err.plot");
    expect(applyChoice(world, { t: "plant", plot: 0, plant: "lily" })).toBe("err.plantArea");
    expect(applyChoice(world, { t: "unlock", area: "lake" })).toBe("err.previousArea");
    expect(applyChoice(world, { t: "craft", item: "lamp" })).toBe("err.workshop");
    expect(world).toEqual(base());
  });

  it("never takes anything away while the hamster rests", () => {
    const entries = Array.from({ length: 144 }, (_, i) => turn(101 + i, 0));
    const before = base();
    const world = replay(before, entries, [choice(100, { t: "plant", plot: 0, plant: "carrot" })]);
    for (const key of Object.keys(before.res) as (keyof typeof before.res)[]) {
      expect(world.res[key]).toBeGreaterThanOrEqual(key === "beans" ? before.res.beans : 0);
    }
    expect(world.res.beans).toBe(before.res.beans);
    expect(world.res.dew).toBe(144 * DEW_PER_REST);
    // Carrots grow at night too, and the 144 resting rounds merge into a few diary entries.
    expect(world.plots[0].growth).toBe(Math.min(PLANTS.carrot.need, 144 * REST_GROWTH));
    expect(world.diary.filter((d) => d.kind === "rest").length).toBe(8);
  });

  it("grows, ripens and harvests a plant", () => {
    const need = PLANTS.carrot.need;
    const entries = [turn(101, need - 100), turn(102, 500)];
    const world = replay(base(), entries, [choice(100, { t: "plant", plot: 0, plant: "carrot" })]);
    expect(world.plots[0].growth).toBe(need);
    expect(world.news.at(-1)?.lines.some((l) => l.k === "d.garden.ripe")).toBe(true);
    expect(check(world, { t: "harvest", plot: 0 })).toBeNull();
    applyChoice(world, { t: "harvest", plot: 0 });
    expect(world.res.carrot).toBe(PLANTS.carrot.yields.carrot);
    expect(world.seeds.carrot).toBe(2);
    expect(world.plots[0].plant).toBeNull();
  });

  it("walks an expedition with settled work and pays its treasure once", () => {
    const route = ROUTES.mossy;
    const entries: Turn[] = Array.from({ length: 12 }, (_, i) => turn(101 + i, 800));
    const choices = [choice(100, { t: "expedition", route: "mossy", gear: [], snack: false, charm: false })];
    const world = replay(base(), entries, choices);
    expect(world.routesDone.mossy).toBe(1);
    expect(world.expedition).toBeNull();
    expect(world.stats.expeditions).toBe(1);
    const done = world.diary.flatMap((d) => d.lines).filter((l) => l.k === "d.adv.done");
    expect(done).toHaveLength(1);
    expect(world.res.wood).toBeGreaterThanOrEqual(10 + (route.reward.wood ?? 0));
  });

  it("takes the path picked at the fork", () => {
    const entries: Turn[] = Array.from({ length: 6 }, (_, i) => turn(101 + i, 600));
    const choices = [
      choice(100, { t: "expedition", route: "mossy", gear: [], snack: false, charm: false }),
      choice(100, { t: "fork", path: "risky" }),
    ];
    const world = replay(base(), entries, choices);
    const fork = world.diary.flatMap((d) => d.lines).find((l) => l.k === "d.adv.fork");
    expect(fork?.v?.path).toBe("risky");
  });

  it("recalling keeps the finds and returns an unused charm", () => {
    const world = base();
    world.items.charm = 1;
    applyChoice(world, { t: "expedition", route: "mossy", gear: [], snack: false, charm: true });
    expect(world.items.charm).toBe(0);
    applyChoice(world, { t: "recall" });
    expect(world.items.charm).toBe(1);
    expect(world.expedition).toBeNull();
  });

  it("fights the shared boss with the planned action and opens the season chest once", () => {
    const season = seasonOf(T);
    const entries: Turn[] = Array.from({ length: 6 }, (_, i) => turn(101 + i, 5000));
    // A turn in the next season ends this one.
    entries.push(turn(107, 0, { at: seasonEnd(season) + 3600_000 }));
    const choices = [
      choice(100, { t: "guild", guild: "lantern", season }),
      choice(100, { t: "class", cls: "ranger" }),
      choice(100, { t: "action", action: "strike" }),
    ];
    const world = replay(base(), entries, choices);
    const earned = world.guild.contribution[season];
    let expected = 0;
    for (const t of entries.slice(0, 6)) {
      const stance = stanceFor(t.seed, season);
      const pct = { drowsy: 200, tricky: 100, fierce: 100, shielded: 50 }[stance];
      expected += Math.floor((t.work * Math.floor((pct * 150) / 100)) / 100);
    }
    expect(earned).toBe(expected);
    expect(world.guild.hits).toBe(6);

    const tier = chestTier(earned, false)!;
    expect(tier).not.toBeNull();
    const beans = world.res.beans;
    expect(applyChoice(world, { t: "chest", season, bossDefeated: false })).toBeNull();
    expect(world.res.beans).toBe(beans + (tier.reward.beans ?? 0));
    expect(applyChoice(world, { t: "chest", season, bossDefeated: false })).toBe("err.opened");
  });

  it("upgrades the chest one tier when the shared boss was defeated", () => {
    expect(chestTier(CHEST_TIERS[0].min - 1, true)).toBeNull();
    expect(chestTier(CHEST_TIERS[0].min, false)?.id).toBe("bronze");
    expect(chestTier(CHEST_TIERS[0].min, true)?.id).toBe("silver");
    expect(chestTier(1_000_000, true)?.id).toBe(CHEST_TIERS.at(-1)!.id);
  });

  it("keeps every building at or below the cottage's level", () => {
    const world = base();
    world.res = { ...world.res, beans: 100_000, wood: 1000, stone: 1000, crystal: 100 };
    expect(applyChoice(world, { t: "build", building: "lantern" })).toBeNull();
    expect(check(world, { t: "build", building: "lantern" })).toBe("err.cottage");
    expect(applyChoice(world, { t: "build", building: "cottage" })).toBeNull();
    expect(applyChoice(world, { t: "build", building: "lantern" })).toBeNull();
    expect(world.buildings).toMatchObject({ cottage: 2, lantern: 2 });
    expect(applyChoice(world, { t: "build", building: "cottage" })).toBeNull();
    expect(applyChoice(world, { t: "build", building: "lantern" })).toBeNull();
    expect(check(world, { t: "build", building: "lantern" })).toBe("err.maxLevel");
    expect(check(world, { t: "build", building: "cottage" })).toBe("err.maxLevel");
  });

  it("makes each building level count", () => {
    const world = base();
    world.buildings = { cottage: 3, silo: 2, lantern: 3, well: 2, workshop: 3 };
    world.plots[0] = { ...world.plots[0], plant: "carrot", growth: 0 };
    const after = replay(world, [turn(101, 1000), turn(102, 0)], []);
    // 100 beans from 1,000 work, +10% for cottage level 3 and +20% for silo level 2.
    expect(after.res.beans - world.res.beans).toBe(100 + 10 + 20);
    // Lantern level 3: 2 + 3 dew in the resting round.
    expect(after.res.dew - world.res.dew).toBe(DEW_PER_REST + 3);
    // Well level 2: the resting round grows the carrot 15 + 2 × 5.
    expect(after.plots[0].growth).toBe(1000 + REST_GROWTH + 2 * WELL_REST_BONUS);
    // Workshop level 3: gear for 75% of the price, rounded up, and one more gear slot.
    expect(craftCost(after, "lamp")).toEqual({ beans: 38, wood: 8, stone: 4, crystal: 1 });
    expect(craftCost(after, "snack")).toEqual(ITEMS.snack.cost);
    expect(gearSlots(after)).toBe(MAX_GEAR + 1);
    expect(gearSlots(base())).toBe(MAX_GEAR);
  });

  it("only lets the player join this season's or next season's guild", () => {
    const world = base();
    const season = seasonOf(clockOf(world));
    expect(check(world, { t: "guild", guild: "seed", season: season - 1 })).toBe("err.season");
    expect(check(world, { t: "guild", guild: "seed", season: season + 2 })).toBe("err.season");
    expect(applyChoice(world, { t: "guild", guild: "seed", season })).toBeNull();
    expect(check(world, { t: "guild", guild: "cog", season })).toBe("err.joined");
  });

  it("keeps this season's guild when the player signs up for next season", () => {
    const season = seasonOf(T);
    const entries: Turn[] = [turn(101, 1000), turn(102, 1000, { at: seasonEnd(season) + 3600_000 })];
    const choices = [choice(100, { t: "guild", guild: "seed", season }), choice(100, { t: "guild", guild: "star", season: season + 1 })];

    // Before next season starts: still in the seed guild, star is only signed up.
    const now = replay(base(), entries.slice(0, 1), choices);
    expect(guildFor(now, season)).toBe("seed");
    expect(guildFor(now, season + 1)).toBe("star");
    expect(hasPerk(now, "seed")).toBe(true);
    expect(check(now, { t: "guild", guild: "cog", season: season + 1 })).toBe("err.joined");
    expect(now.guild.contribution[season]).toBeGreaterThan(0);

    // The first turn of next season moves the sign-up into place, and it fights there.
    const later = replay(base(), entries, choices);
    expect(later.guild).toMatchObject({ guild: "star", season: season + 1, next: null });
    expect(hasPerk(later, "star")).toBe(true);
    expect(later.guild.contribution[season + 1]).toBeGreaterThan(0);
    expect(check(later, { t: "guild", guild: "cog", season: season + 2 })).toBeNull();
  });

  it("keeps one growth line for a long night of single-round settlements", () => {
    // The real feed settles a resting round at a time; 18 of them share one diary entry.
    const entries = Array.from({ length: 20 }, (_, i) => turn(101 + i, 0));
    const choices = [choice(100, { t: "plant", plot: 0, plant: "carrot" }), choice(100, { t: "plant", plot: 1, plant: "clover" })];
    const world = replay(base(), entries, choices);
    const nights = world.diary.filter((d) => d.kind === "rest");
    expect(nights.map((d) => d.rounds)).toEqual([18, 2]);
    for (const night of nights) {
      const grow = night.lines.filter((l) => l.k === "d.garden.grow");
      expect(grow).toHaveLength(1);
      expect(String(grow[0].v?.plants).split(",").sort()).toEqual(["carrot", "clover"]);
    }
  });

  it("never says a trial turn was settled on Sepolia", () => {
    const sim = turn(101, 500, { sim: true });
    const world = replay(newWorld(ORIGIN, T, true), [sim], []);
    const head = world.diary.find((d) => d.kind === "active")!.lines[0];
    expect(renderLine("en", head)).not.toContain("Sepolia");
    expect(renderLine("zh", head)).not.toContain("Sepolia");
    expect(renderLine("en", replay(base(), [turn(101, 500)], []).diary.find((d) => d.kind === "active")!.lines[0])).toContain("settled on Sepolia");
  });

  it("gives nothing for rounds it could not read back", () => {
    const entries: LedgerEntry[] = [{ kind: "gap", id: "gap:101-180", from: 101, to: 180, at: T + 180 * ROUND }, turn(181, 100)];
    const world = replay(base(), entries, []);
    expect(world.frontier).toBe(181);
    expect(world.res.beans).toBe(100 + 10);
    expect(world.diary.some((d) => d.kind === "gap" && d.rounds === 80)).toBe(true);
  });

  it("folding old turns into the checkpoint leaves the world unchanged", () => {
    const save: SaveFile = { v: 1, kind: "sim", installation: null, base: newWorld(0, T, true), entries: [], choices: [], seq: 0, updated: 0 };
    let entries: LedgerEntry[] = [];
    const choices: ChoiceRecord[] = [];
    for (let day = 0; day < 18; day++) {
      const draft = { ...save, entries };
      entries = [...entries, ...simTurns(draft, day % 2 ? "active" : "rest", 144)];
      const frontier = entries[entries.length - 1].to;
      choices.push({ seq: choices.length + 1, at: frontier, made: 0, c: { t: "plant", plot: day % 3, plant: "carrot" } });
      choices.push({ seq: choices.length + 1, at: frontier, made: 0, c: { t: "harvest", plot: (day + 1) % 3 } });
    }
    const full: SaveFile = { ...save, entries, choices, seq: choices.length };
    const pruned = prune(full);
    expect(pruned.entries.length).toBeLessThan(full.entries.length);
    expect(worldOf(pruned)).toEqual(worldOf(full));
  });
});
