import { describe, expect, it } from "vitest";
import { sharedBoss, simulatedBoss } from "../src/world/boss";
import { BOSSES, COMMUNITY_DAMAGE, MILESTONE_DAMAGE } from "../src/world/data";
import { BusyError, readCommunity, readWeek, type FetchLike } from "../src/world/feed";
import { seasonOf, seasonStart } from "../src/world/season";
import { addSimDay, addSimTurns, loadSim, resetSim } from "../src/world/sim";
import { loadSave, worldOf, exportSave, importSave, SAVE_KEYS } from "../src/world/store";
import { pull, recordChoice } from "../src/world/sync";
import { PROTOCOL_FIXTURE, eventsPage, fixture, jsonResponse, memoryStorage, settlementEvent } from "./world-helpers";

const protocol = fixture(PROTOCOL_FIXTURE);
const NEWEST_AT = Date.parse(protocol.events[0].occurredAt);

/** Serves the captured first page, then `older` for the cursor, plus `extra` newer settlements on top. */
function feed(extra: unknown[] = [], older: unknown[] = []): FetchLike & { calls: string[] } {
  const calls: string[] = [];
  const fn = (async (url: string) => {
    calls.push(url);
    if (url.includes("cursor=")) return jsonResponse(eventsPage(older, null));
    return jsonResponse(eventsPage([...extra, ...protocol.events], protocol.nextCursor));
  }) as FetchLike & { calls: string[] };
  fn.calls = calls;
  return fn;
}

describe("world sync", () => {
  it("founds a new world on the newest settled round, without paying past rounds", async () => {
    const storage = memoryStorage();
    const result = await pull({ fetchImpl: feed(), storage, now: NEWEST_AT });
    expect(result.founded).toBe(true);
    expect(result.save.base.frontier).toBe(307);
    expect(result.save.entries).toEqual([]);
    expect(result.save.installation).toBe("sepolia-core-sepolia-20261103");
    expect(loadSave("real", storage)).toEqual(result.save);
  });

  it("adds new settlements once and is idempotent", async () => {
    const storage = memoryStorage();
    await pull({ fetchImpl: feed(), storage, now: NEWEST_AT });
    const next = [settlementEvent(309, 309, 800, NEWEST_AT + 1_200_000, "a1"), settlementEvent(308, 308, 400, NEWEST_AT + 600_000, "b2")];
    const first = await pull({ fetchImpl: feed(next), storage, now: NEWEST_AT + 1_300_000 });
    expect(first.changed).toBe(true);
    expect(first.added.map((t) => t.to)).toEqual([308, 309]);
    const world = worldOf(first.save);
    expect(world.frontier).toBe(309);
    expect(world.res.beans).toBe(100 + 120);

    const again = await pull({ fetchImpl: feed(next), storage, now: NEWEST_AT + 1_400_000 });
    expect(again.changed).toBe(false);
    expect(worldOf(again.save)).toEqual(world);
  });

  it("keeps choices recorded by another window while it merges", async () => {
    const storage = memoryStorage();
    await pull({ fetchImpl: feed(), storage, now: NEWEST_AT });
    recordChoice("real", { t: "plant", plot: 0, plant: "carrot" }, NEWEST_AT, storage);
    const next = [settlementEvent(308, 308, 300, NEWEST_AT + 600_000)];
    const result = await pull({ fetchImpl: feed(next), storage, now: NEWEST_AT + 700_000 });
    expect(result.save.choices).toHaveLength(1);
    expect(worldOf(result.save).plots[0]).toMatchObject({ plant: "carrot", growth: 300 });
  });

  it("catches up after being closed and marks unreachable rounds as a gap", async () => {
    const storage = memoryStorage();
    const founded = await pull({ fetchImpl: feed(), storage, now: NEWEST_AT });
    // Pretend the world was founded long ago, at round 200.
    storage.setItem(SAVE_KEYS.real, JSON.stringify({ ...founded.save, base: { ...founded.save.base, origin: 200, frontier: 200 } }));
    const result = await pull({ fetchImpl: feed(), storage, now: NEWEST_AT });
    const world = worldOf(result.save);
    expect(world.frontier).toBe(307);
    const gap = world.diary.find((d) => d.kind === "gap");
    expect(gap).toMatchObject({ from: 201, to: 287 });
  });

  it("starts a new timeline when Squeekchain moves to a new deployment", async () => {
    const storage = memoryStorage();
    await pull({ fetchImpl: feed(), storage, now: NEWEST_AT });
    recordChoice("real", { t: "plant", plot: 0, plant: "carrot" }, NEWEST_AT, storage);
    const moved: FetchLike = async () => jsonResponse(eventsPage([settlementEvent(5, 5, 100, NEWEST_AT + 600_000)], null, { ...protocol, installationId: "new-deployment" }));
    const result = await pull({ fetchImpl: moved, storage, now: NEWEST_AT + 700_000 });
    expect(result.reorg).toBe(true);
    expect(result.save.installation).toBe("new-deployment");
    expect(result.save.base.frontier).toBe(5);
    expect(result.save.base.plots[0].plant).toBe("carrot");
  });

  it("reports a busy API with its retry time", async () => {
    const busy: FetchLike = async () => new Response("", { status: 429, headers: { "Retry-After": "7" } });
    await expect(pull({ fetchImpl: busy, storage: memoryStorage() })).rejects.toEqual(new BusyError(7000));
  });

  it("round-trips a save through export and import", async () => {
    const storage = memoryStorage();
    const { save } = await pull({ fetchImpl: feed(), storage, now: NEWEST_AT });
    expect(importSave(exportSave(save), "real")).toEqual(save);
    expect(importSave(exportSave(save), "sim")).toBeNull();
    expect(importSave("{not json", "real")).toBeNull();
  });
});

describe("shared boss", () => {
  it("adds up this season's settled work and real community activity", async () => {
    const week = fixture("settlements-7d-20261105.json");
    const players = fixture("events-players-20261105.json");
    const fetchImpl: FetchLike = async (url) => {
      if (url.includes("/v1/settlements")) return jsonResponse(week);
      if (url.includes("cursor=")) return jsonResponse({ ...players, events: [], nextCursor: null });
      return jsonResponse(players);
    };
    const season = seasonOf(Date.parse("2026-11-04T11:30:00Z"));
    expect(season).toBe(1);
    const buckets = await readWeek(fetchImpl);
    expect(buckets).toHaveLength(28);
    const community = await readCommunity(fetchImpl, seasonStart(season), "players");
    expect(community.complete).toBe(true);
    const expectedCommunity = players.events.reduce((sum: number, e: any) => sum + (COMMUNITY_DAMAGE[e.type] ?? 0), 0);
    expect(community.events.reduce((sum, e) => sum + e.damage, 0)).toBe(expectedCommunity);
    // Addresses are never kept.
    expect(JSON.stringify(community)).not.toMatch(/0x[0-9a-f]{8}/i);

    const boss = sharedBoss(season, buckets, community, { events: [], complete: true });
    const work = buckets.filter((b) => b.startAt >= seasonStart(season)).reduce((sum, b) => sum + b.work, 0);
    expect(boss.boss).toBe(BOSSES[0]);
    expect(boss.hamster).toBe(work);
    expect(boss.damage).toBe(work + expectedCommunity);
    expect(boss.left).toBe(Math.max(0, BOSSES[0].hp - work - expectedCommunity));
  });

  it("reads the hamster's real milestones as critical hits, without addresses", async () => {
    const measurement = fixture("events-measurement-20261105.json");
    const fetchImpl: FetchLike = async () => jsonResponse(measurement);
    const read = await readCommunity(fetchImpl, Date.parse("2026-11-02T12:00:00Z"), "measurement");
    expect(read.complete).toBe(true);
    expect(read.events).toHaveLength(measurement.events.length);
    expect(read.events.every((e) => e.damage === MILESTONE_DAMAGE[e.type])).toBe(true);
    const record = read.events.find((e) => e.type === "measurement.speed_record");
    expect(record?.detail).toBeGreaterThan(0);
  });

  it("stays unknown, not zero, when the week can't be read", () => {
    const boss = sharedBoss(1, null, null, null);
    expect(boss.damage).toBeNull();
    expect(boss.left).toBeNull();
    expect(boss.defeated).toBeNull();
  });
});

describe("trial world", () => {
  it("keeps a separate, clearly simulated save", () => {
    const storage = memoryStorage();
    const now = Date.parse("2026-11-04T12:00:00Z");
    expect(loadSim(storage, now).kind).toBe("sim");
    addSimTurns("active", 3, storage, now);
    const day = addSimDay(storage, now);
    expect(day.entries).toHaveLength(147);
    expect(day.entries.every((e) => e.kind === "turn" && e.sim)).toBe(true);
    expect(loadSave("real", storage)).toBeNull();
    const world = worldOf(day);
    expect(world.diary.every((d) => d.kind === "start" || d.kind === "event" || d.sim)).toBe(true);
    expect(simulatedBoss(seasonOf(now), day.entries).simulated).toBe(true);
    expect(resetSim(storage, now).entries).toEqual([]);
  });
});
