import { describe, expect, it } from "vitest";
import { WorldLink } from "../src/pet/world-link";
import { PLANTS, ROUTES } from "../src/world/data";
import { newWorld, replay } from "../src/world/engine";
import { loadSave, worldOf } from "../src/world/store";
import { closedChests, newsOf, newsToast, worldSummary } from "../src/world/summary";
import { pull, recordChoice } from "../src/world/sync";
import type { ChoiceRecord, WorldState } from "../src/world/types";
import type { FetchLike } from "../src/world/feed";
import { T, eventsPage, jsonResponse, memoryStorage, settlementEvent, turn } from "./world-helpers";

const ORIGIN = 100;
const plantCarrot: ChoiceRecord = { seq: 1, at: ORIGIN, made: 0, c: { t: "plant", plot: 0, plant: "carrot" } };

/** A world whose carrot ripens on turn 102. */
function ripeWorld(): WorldState {
  return replay(newWorld(ORIGIN, T), [turn(101, PLANTS.carrot.need - 100), turn(102, 500)], [plantCarrot]);
}

describe("the pet's view of the world", () => {
  it("sums up what is ready or under way in one line", () => {
    const fresh = newWorld(ORIGIN, T);
    expect(worldSummary(fresh, "en")).toBe("100 data beans");
    expect(worldSummary(fresh, "zh")).toBe("100 数据豆");
    const world = ripeWorld();
    expect(worldSummary(world, "en")).toBe("1 ready to pick");
    world.expedition = { route: "mossy", steps: ROUTES.mossy.length / 2, node: 2, gear: [], snack: false, charm: false, fork: null, found: {}, since: 103 };
    expect(worldSummary(world, "en")).toBe("1 ready to pick · On the trail, 50%");
    expect(worldSummary(world, "zh")).toBe("1 株可以收获，探险中 50%");
  });

  it("points at a closed chest from a past season", () => {
    const world = newWorld(ORIGIN, T);
    world.guild.contribution[0] = 20_000;
    expect(closedChests(world)).toEqual([0]);
    expect(worldSummary(world, "en")).toBe("Chest to open");
    world.guild.chests.push(0);
    expect(closedChests(world)).toEqual([]);
  });

  it("tells the news of the turns a pull added, newest in the toast", () => {
    const world = ripeWorld();
    expect(newsOf(world, [turn(101, 0).id], "en")).toEqual([]);
    const news = newsOf(world, [turn(102, 0).id], "en");
    expect(news).toEqual(["The carrot in bed 1 is ripe!"]);
    expect(newsToast(news, "en")).toBe("The carrot in bed 1 is ripe!");
    expect(newsToast(["a", "b", "c"], "en")).toBe("c (+2 more)");
    expect(newsToast(["a", "b"], "zh")).toBe("b （另有 1 条）");
    expect(newsToast([], "en")).toBeNull();
  });
});

describe("the pet's world link", () => {
  const at0 = Date.parse("2026-11-05T12:00:00Z");
  const tick = (n: number) => at0 + n * 600_000;

  function chain() {
    let events: unknown[] = [settlementEvent(ORIGIN, ORIGIN, 0, tick(0), "a0")];
    const calls: string[] = [];
    const fetchImpl: FetchLike = async (url) => {
      calls.push(url);
      return jsonResponse(eventsPage(events, null));
    };
    return { fetchImpl, calls, settle: (next: unknown[]) => (events = [...next, ...events]) };
  }

  it("never founds a world on its own", async () => {
    const storage = memoryStorage();
    const { fetchImpl, calls } = chain();
    const link = new WorldLink({ language: () => "en", onNews: () => {}, fetchImpl, storage });
    await link.pullOnce();
    expect(calls).toHaveLength(0);
    expect(link.state).toBeNull();
    expect(loadSave("real", storage)).toBeNull();
  });

  it("follows a founded world and toasts what new turns brought", async () => {
    const storage = memoryStorage();
    const { fetchImpl, settle } = chain();
    const news: string[][] = [];
    const link = new WorldLink({ language: () => "en", onNews: (texts) => news.push(texts), fetchImpl, storage, now: () => tick(1) });
    // Opening the World window founds the world; the pet only follows it.
    await pull({ fetchImpl, storage, now: tick(0) });
    recordChoice("real", { t: "plant", plot: 0, plant: "carrot" }, tick(0), storage);
    expect(link.refresh()?.plots[0].plant).toBe("carrot");

    settle([
      settlementEvent(ORIGIN + 2, ORIGIN + 2, 500, tick(2), "a2"),
      settlementEvent(ORIGIN + 1, ORIGIN + 1, PLANTS.carrot.need - 100, tick(1), "a1"),
    ]);
    await link.pullOnce();
    expect(news).toEqual([["The carrot in bed 1 is ripe!"]]);
    expect(worldSummary(link.state!, "en")).toBe("1 ready to pick");
    // Nothing new: no toast.
    await link.pullOnce();
    expect(news).toHaveLength(1);
    // A harvest in the World window shows up when the bubble re-reads the save.
    recordChoice("real", { t: "harvest", plot: 0 }, tick(3), storage);
    const save = loadSave("real", storage)!;
    expect(link.refresh()).toEqual(worldOf(save));
    expect(worldSummary(link.state!, "en")).not.toContain("ready to pick");
  });
});
