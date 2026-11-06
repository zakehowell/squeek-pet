import { describe, expect, it } from "vitest";
import { backfilling, communityCap, milestoneCap, refreshCommunity, seasonDamage, settles, sharedBoss, simulatedBoss } from "../src/world/boss";
import { BOSSES, COMMUNITY_DAMAGE, MILESTONE_DAMAGE } from "../src/world/data";
import { BusyError, mergeNewer, readCommunity, readDays, readFrom, type CommunityEvent, type FetchLike } from "../src/world/feed";
import { bossOf, seasonOf, seasonStart } from "../src/world/season";
import { addSimDay, addSimTurns, loadSim, resetSim } from "../src/world/sim";
import { loadSave, worldOf, exportSave, importSave, SAVE_KEYS } from "../src/world/store";
import { CATCH_UP_PAGES, pull, recordChoice } from "../src/world/sync";
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

  it("catches up about two weeks of pages after a long absence, pacing the later pages", async () => {
    const storage = memoryStorage();
    const founded = await pull({ fetchImpl: feed(), storage, now: NEWEST_AT });
    storage.setItem(SAVE_KEYS.real, JSON.stringify({ ...founded.save, base: { ...founded.save.base, origin: 200, frontier: 200 } }));
    // One settlement a page, newest first: round 360 on page 0, 359 on page 1, and so on.
    const calls: string[] = [];
    const paged: FetchLike = async (url) => {
      calls.push(url);
      const page = Number(/cursor=p(\d+)/.exec(url)?.[1] ?? 0);
      const round = 360 - page;
      return jsonResponse(eventsPage([settlementEvent(round, round, 100, NEWEST_AT + round * 600_000, page.toString(16).padStart(2, "0"))], `p${page + 1}`));
    };
    const pauses: number[] = [];
    const result = await pull({ fetchImpl: paged, storage, now: NEWEST_AT, pause: async (ms) => void pauses.push(ms) });
    expect(calls).toHaveLength(CATCH_UP_PAGES);
    expect(CATCH_UP_PAGES).toBeGreaterThanOrEqual(40);
    expect(pauses).toHaveLength(CATCH_UP_PAGES - 4);
    const world = worldOf(result.save);
    expect(world.frontier).toBe(360);
    // Rounds older than the last page read give nothing and are marked.
    expect(world.diary.find((d) => d.kind === "gap")).toMatchObject({ from: 201, to: 360 - CATCH_UP_PAGES });
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
  const playersBase = fixture("events-players-20261105.json");
  const MINUTE = 60_000;
  const playerEvent = (id: string, type: string, at: number) => ({
    id,
    eventVersion: 1,
    type,
    occurredAt: new Date(at).toISOString(),
    recordedAt: new Date(at).toISOString(),
    source: { kind: "chain" },
    payload: { account: "0x1111111111111111111111111111111111111111", level: 3 },
  });
  /** A players feed served page by page; cursors are "p1", "p2"…; page `busyAt` answers 429. */
  function pagedFeed(pages: unknown[][], busyAt?: number): FetchLike & { calls: string[] } {
    const calls: string[] = [];
    const fn = (async (url: string) => {
      calls.push(url);
      const cursor = new URL(url).searchParams.get("cursor");
      const index = cursor ? Number(cursor.slice(1)) : 0;
      if (index === busyAt) return new Response("busy", { status: 429, headers: { "Retry-After": "7" } });
      return jsonResponse(eventsPage(pages[index] ?? [], index + 1 < pages.length ? `p${index + 1}` : null, playersBase));
    }) as FetchLike & { calls: string[] };
    fn.calls = calls;
    return fn;
  }
  /** `count` events of one type, one a minute going back from `newest`, split into pages of 100. */
  function pagesOf(type: string, count: number, newest: number, prefix: string): unknown[][] {
    const events = Array.from({ length: count }, (_, i) => playerEvent(`${prefix}${i}`, type, newest - i * MINUTE));
    return Array.from({ length: Math.ceil(count / 100) }, (_, i) => events.slice(i * 100, i * 100 + 100));
  }
  const noPause = { pause: async () => {} };
  const playerCap = (season: number) => communityCap(bossOf(season));

  it("adds up this season's settled work and real community activity", async () => {
    const month = fixture("settlements-30d-20261105.json");
    const players = fixture("events-players-20261105.json");
    const fetchImpl: FetchLike = async (url) => {
      if (url.includes("/v1/settlements")) return jsonResponse(month);
      if (url.includes("cursor=")) return jsonResponse({ ...players, events: [], nextCursor: null });
      return jsonResponse(players);
    };
    const season = seasonOf(Date.parse(month.generatedAt));
    expect(season).toBe(1);
    const days = await readDays(fetchImpl);
    expect(days).toHaveLength(30);
    expect(days.every((d) => (d.startAt - seasonStart(1)) % 86_400_000 === 0)).toBe(true);
    const community = await readCommunity(fetchImpl, seasonStart(season), "players");
    expect(community.coveredFrom).toBe(seasonStart(season));
    expect(community.older).toBeNull();
    const expectedCommunity = players.events.reduce((sum: number, e: any) => sum + (COMMUNITY_DAMAGE[e.type] ?? 0), 0);
    expect(expectedCommunity).toBeLessThan(communityCap(BOSSES[0]));
    expect(community.events.reduce((sum, e) => sum + e.damage, 0)).toBe(expectedCommunity);
    // Addresses are never kept.
    expect(JSON.stringify(community)).not.toMatch(/0x[0-9a-f]{8}/i);

    const none = { since: seasonStart(season), events: [], coveredFrom: seasonStart(season), older: null };
    const boss = sharedBoss(season, days, community, none);
    expect(boss.boss).toBe(BOSSES[0]);
    expect(boss.hamster).toBe(3817);
    expect(boss.community).toBe(expectedCommunity);
    expect(boss.communityCount).toBe(players.events.length);
    expect(boss.damage).toBe(3817 + expectedCommunity);
    expect(boss.left).toBe(BOSSES[0].hp - 3817 - expectedCommunity);
    expect(boss.complete).toBe(true);
    expect(boss.defeated).toBe(false);
  });

  it("reads the hamster's real milestones as critical hits, without addresses", async () => {
    const measurement = fixture("events-measurement-20261105.json");
    const fetchImpl: FetchLike = async () => jsonResponse(measurement);
    const since = Date.parse("2026-11-02T12:00:00Z");
    const read = await readCommunity(fetchImpl, since, "measurement");
    expect(read.coveredFrom).toBe(since);
    expect(read.events).toHaveLength(measurement.events.length);
    expect(read.events.every((e) => e.damage === MILESTONE_DAMAGE[e.type])).toBe(true);
    const record = read.events.find((e) => e.type === "measurement.speed_record");
    expect(record?.detail).toBeGreaterThan(0);
  });

  it("caps community activity and milestones at their share of the boss's HP", () => {
    const boss = BOSSES[0];
    const start = seasonStart(1);
    const ev = (id: string, damage: number): CommunityEvent => ({ id, type: "nft.merged", at: start + 3_600_000, damage, detail: null });
    // A launch-day crowd: far more than the community's share.
    const crowd = { since: start, events: Array.from({ length: 4000 }, (_, i) => ev(`c${i}`, 30)), coveredFrom: start + 86_400_000, older: "p40" };
    const feats = { since: start, events: Array.from({ length: 30 }, (_, i) => ev(`m${i}`, 1500)), coveredFrom: start, older: null };
    const day = (work: number) => [{ startAt: start, endAt: start + 86_400_000, work }];
    expect(settles(crowd, 1, communityCap(boss))).toBe(true);
    const short = sharedBoss(1, day(20_000), crowd, feats);
    expect(short.community).toBe(communityCap(boss));
    expect(short.milestones).toBe(milestoneCap(boss));
    expect(communityCap(boss) + milestoneCap(boss)).toBe(boss.hp / 2);
    expect(short.communityCount).toBe(4000);
    // Capped shares are exact even though the crowd wasn't read to the season start.
    expect(short.complete).toBe(true);
    expect(short.defeated).toBe(false);
    // The hamster has to land the other half.
    expect(sharedBoss(1, day(boss.hp / 2), crowd, feats).defeated).toBe(true);
    // An open read below the cap is only a lower bound: unknown, never "not defeated".
    const open = { ...crowd, events: crowd.events.slice(0, 10) };
    expect(settles(open, 1, communityCap(boss))).toBe(false);
    expect(sharedBoss(1, day(1000), open, feats).defeated).toBeNull();
    expect(sharedBoss(1, day(boss.hp), open, feats).defeated).toBe(true);
  });

  it("stops paging once this season's share is full", async () => {
    const newest = seasonStart(1) + 2 * 86_400_000;
    const feed = pagedFeed(pagesOf("nft.merged", 1000, newest, "m"));
    const read = await refreshCommunity(feed, null, "players", [1], playerCap, noPause);
    // 120 damage a merge: the 15,000 cap is reached on the second page.
    expect(feed.calls).toHaveLength(2);
    expect(read.older).toBe("p2");
    expect(sharedBoss(1, [], read, null).community).toBe(playerCap(1));
    expect(backfilling(read, [1], playerCap)).toBe(false);
    // A full share needs no more reading this season.
    expect(await refreshCommunity(feed, read, "players", [1], playerCap, noPause)).toBe(read);
    expect(feed.calls).toHaveLength(2);
  });

  it("adds newer events to an open read, joining it when the new pages reach back", async () => {
    const start = seasonStart(1);
    const older = await refreshCommunity(pagedFeed(pagesOf("nft.withdrawn", 50, start + 7_200_000, "w")), null, "players", [1], playerCap, noPause);
    expect(older.coveredFrom).toBe(start);
    expect(readFrom(older, start)).toBe(start + 7_200_000);
    // Ten newer withdrawals on top of the same fifty: each one is kept once.
    const both = [...pagesOf("nft.withdrawn", 10, start + 7_800_000, "x")[0], ...pagesOf("nft.withdrawn", 50, start + 7_200_000, "w")[0]];
    const feed = pagedFeed([both]);
    const merged = await refreshCommunity(feed, older, "players", [1], playerCap, noPause);
    expect(merged.events).toHaveLength(60);
    expect(merged.coveredFrom).toBe(start);
    expect(seasonDamage(merged.events, 1)).toEqual({ damage: 600, count: 60 });
    // A newer read that never reached back leaves a gap: only its own stretch counts as covered.
    const gap = mergeNewer(older, { since: start + 9_000_000, events: [], coveredFrom: start + 9_000_000, older: "p9" });
    expect(gap.coveredFrom).toBe(start + 9_000_000);
    expect(gap.older).toBe("p9");
    expect(gap.events).toHaveLength(50);
  });

  it("reads last season's result in steps while its chest waits", async () => {
    // Season 2 is busy: 2,200 deposits. Season 1 ended with a run of merges.
    const turnover = seasonStart(2);
    const pages = [...pagesOf("nft.deposited", 2200, turnover + 2 * 86_400_000, "d"), ...pagesOf("nft.merged", 300, turnover - 3_600_000, "m")];
    const feed = pagedFeed(pages);
    const first = await refreshCommunity(feed, null, "players", [2, 1], playerCap, noPause);
    expect(feed.calls).toHaveLength(20);
    expect(first.older).toBe("p20");
    expect(backfilling(first, [2, 1], playerCap)).toBe(true);
    expect(sharedBoss(1, [], first, null).complete).toBe(false);
    const second = await refreshCommunity(feed, first, "players", [2, 1], playerCap, noPause);
    // Two more pages of season 2, then two of season 1 reach its cap.
    expect(feed.calls).toHaveLength(24);
    expect(backfilling(second, [2, 1], playerCap)).toBe(false);
    const last = sharedBoss(1, [], second, null);
    expect(last.community).toBe(playerCap(1));
    expect(settles(second, 1, playerCap(1))).toBe(true);
    expect(sharedBoss(2, [], second, null).community).toBe(playerCap(2));
  });

  it("keeps what it read when the API turns busy midway", async () => {
    const start = seasonStart(1);
    const pages = pagesOf("nft.deposited", 400, start + 3 * 86_400_000, "d");
    const read = await readCommunity(pagedFeed(pages, 2), start, "players", { maxPages: 6, ...noPause });
    expect(read.events).toHaveLength(200);
    expect(read.older).toBe("p2");
    expect(read.coveredFrom).toBe(start + 3 * 86_400_000 - 199 * MINUTE + 1);
    await expect(readCommunity(pagedFeed(pages, 0), start, "players")).rejects.toBeInstanceOf(BusyError);
  });

  it("stays unknown, not zero, when the settled work can't be read", () => {
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
