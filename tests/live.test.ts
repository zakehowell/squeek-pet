import { describe, expect, it, vi } from "vitest";
import { LIVE_DESCRIPTOR_URL, LIVE_PROFILE_URL, createLiveLink, liveBroadcast } from "../src/core/live";
import { demoSnapshot } from "../src/core/demo";
import { PetMachine } from "../src/core/pet-machine";
import { offersLiveStream } from "../src/pet/present";
import { T0, snap, type SnapOptions } from "./helpers";

const NOW = Date.parse("2026-11-02T22:00:00.000Z");

/** Shaped like squeekchain.com's live descriptor (schema 2) during a stream. */
const liveX = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 2,
  state: "live",
  playback: { kind: "x", broadcastId: "1qGoNYoyoRlKv" },
  observedAt: "2026-11-02T21:59:30.000Z",
  validUntil: "2026-11-02T22:05:00.000Z",
  errorCode: null,
  ...overrides,
});

/** The real descriptor served on 2026-11-02 between streams. */
const idle = {
  schemaVersion: 2,
  state: "idle",
  playback: { kind: "canonical-hls" },
  observedAt: "2026-11-02T10:31:20.772Z",
  validUntil: null,
  errorCode: null,
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("live descriptor", () => {
  it("turns a live X broadcast into its x.com address", () => {
    expect(liveBroadcast(liveX(), NOW)).toEqual({
      url: "https://x.com/i/broadcasts/1qGoNYoyoRlKv",
      validUntil: Date.parse("2026-11-02T22:05:00.000Z"),
    });
  });

  it("ignores idle, expired, non-X and malformed descriptors", () => {
    expect(liveBroadcast(idle, NOW)).toBeNull();
    expect(liveBroadcast(liveX({ validUntil: "2026-11-02T21:59:59.000Z" }), NOW)).toBeNull();
    expect(liveBroadcast(liveX({ validUntil: null }), NOW)).toBeNull();
    expect(liveBroadcast(liveX({ playback: { kind: "youtube", publicId: "dQw4w9WgXcQ" } }), NOW)).toBeNull();
    expect(liveBroadcast(liveX({ playback: { kind: "x", broadcastId: "../../evil" } }), NOW)).toBeNull();
    expect(liveBroadcast(liveX({ playback: { kind: "x", broadcastId: "short" } }), NOW)).toBeNull();
    expect(liveBroadcast(liveX({ schemaVersion: 3 }), NOW)).toBeNull();
    expect(liveBroadcast(null, NOW)).toBeNull();
    expect(liveBroadcast("live", NOW)).toBeNull();
  });
});

describe("live link", () => {
  it("opens the @squeekchain profile until a broadcast is known", () => {
    const link = createLiveLink(vi.fn());
    expect(link.url(NOW)).toBe(LIVE_PROFILE_URL);
    expect(LIVE_PROFILE_URL).toBe("https://x.com/squeekchain");
  });

  it("opens the live broadcast while the descriptor says it is live", async () => {
    const fetchImpl = vi.fn(async () => json(liveX()));
    const link = createLiveLink(fetchImpl);
    await link.refresh(NOW);
    expect(fetchImpl).toHaveBeenCalledWith(LIVE_DESCRIPTOR_URL, expect.objectContaining({ cache: "no-store", credentials: "omit" }));
    expect(link.url(NOW)).toBe("https://x.com/i/broadcasts/1qGoNYoyoRlKv");
    // Once the descriptor's validity ends, the profile is the safe answer.
    expect(link.url(Date.parse("2026-11-02T22:05:01.000Z"))).toBe(LIVE_PROFILE_URL);
  });

  it("falls back to the profile when the descriptor is blocked, missing or idle", async () => {
    const blocked = createLiveLink(vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    await blocked.refresh(NOW);
    expect(blocked.url(NOW)).toBe(LIVE_PROFILE_URL);

    const missing = createLiveLink(vi.fn(async () => new Response("", { status: 404 })));
    await missing.refresh(NOW);
    expect(missing.url(NOW)).toBe(LIVE_PROFILE_URL);

    const between = createLiveLink(vi.fn(async () => json(idle)));
    await between.refresh(NOW);
    expect(between.url(NOW)).toBe(LIVE_PROFILE_URL);
  });

  it("reads the descriptor at most every 30 seconds", async () => {
    const fetchImpl = vi.fn(async () => json(idle));
    const link = createLiveLink(fetchImpl);
    await Promise.all([link.refresh(NOW), link.refresh(NOW)]);
    await link.refresh(NOW + 29_000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await link.refresh(NOW + 30_000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("forgets a broadcast once the stream ends", async () => {
    const fetchImpl = vi.fn(async () => json(liveX())).mockImplementationOnce(async () => json(liveX())).mockImplementation(async () => json(idle));
    const link = createLiveLink(fetchImpl);
    await link.refresh(NOW);
    expect(link.url(NOW)).toContain("/i/broadcasts/");
    await link.refresh(NOW + 30_000);
    expect(link.url(NOW + 30_000)).toBe(LIVE_PROFILE_URL);
  });
});

describe("when the live pill is offered", () => {
  function stateAfter(...readings: SnapOptions[]) {
    const machine = new PetMachine(T0);
    readings.forEach((options, i) => {
      const at = T0 + i * 1000;
      machine.dispatch({ type: "snapshot", snapshot: snap({ ...options, at }), at });
    });
    return machine.state;
  }

  it("only while the real hamster runs", () => {
    expect(offersLiveStream(stateAfter({ core: "ACTIVE", rpm: 80 }))).toBe(true);
    expect(offersLiveStream(stateAfter({ core: "IDLE" }))).toBe(false);
    expect(offersLiveStream(stateAfter({ core: "ACTIVE", rpm: 80 }, { core: "ACTIVE", rpm: 80, freshness: "stale" }))).toBe(false);
  });

  it("never for demo, simulated or replayed data", () => {
    expect(offersLiveStream(stateAfter({ core: "ACTIVE", rpm: 80, provenance: "simulated" }))).toBe(false);
    expect(offersLiveStream(stateAfter({ core: "ACTIVE", rpm: 80, provenance: "replay" }))).toBe(false);
    const demo = new PetMachine(T0);
    for (let at = T0; at < T0 + 60_000; at += 1000) {
      demo.dispatch({ type: "snapshot", snapshot: demoSnapshot(T0, at), at });
      if (demo.state.mode === "running") break;
    }
    expect(demo.state.mode).toBe("running");
    expect(offersLiveStream(demo.state)).toBe(false);
  });
});
