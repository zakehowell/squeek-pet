import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { InvalidStatusError, UnsupportedSchemaError, isStale, parseStatus } from "../src/core/telemetry";
import { liveStatusJson } from "./helpers";

describe("parseStatus", () => {
  it("reads the captured live response with exact integers", () => {
    const snapshot = parseStatus(liveStatusJson());
    expect(snapshot.source).toBe("api");
    expect(snapshot.installationId).toBe("stream-game-sepolia-test-20261025-01");
    const m = snapshot.measurement!;
    expect(m.coreStatus).toBe("IDLE");
    expect(m.provenance).toBe("hardware");
    expect(m.freshness).toBe("online");
    expect(m.cumulativeWorkUnits).toBe(45957n);
    expect(m.rpm).toBe(0);
    expect(m.staleAfterSeconds).toBe(120);
    expect(m.receivedAt).toBe(Date.parse("2026-10-30T13:26:07.424Z"));
    expect(snapshot.settlement).toEqual({
      blockHeight: 4135n,
      settledThroughRound: 573n,
      cumulativeWork: 45957n,
      confirmedAt: Date.parse("2026-10-30T13:20:36.000Z"),
      transactionHash: "0x76229fb58f53e5406cdca3380cf8a300094e433fce0500530fa51e860a9be7b1",
      queuedWork: 0n,
    });
  });

  it("reads the live response after the move to release core-sepolia-20261103", () => {
    const body = JSON.parse(readFileSync(new URL("./fixtures/status-idle-20261105.json", import.meta.url), "utf8"));
    const snapshot = parseStatus(body);
    expect(snapshot.installationId).toBe("sepolia-core-sepolia-20261103");
    expect(snapshot.measurement?.cumulativeWorkUnits).toBe(3817n);
    expect(snapshot.settlement).toMatchObject({ blockHeight: 366n, settledThroughRound: 306n, cumulativeWork: 3817n, queuedWork: 0n });
  });

  it("adds up the measured work still waiting to be settled", () => {
    const body = liveStatusJson();
    body.builder.queued = { closedRoundCount: "2", closedWorkUnits: "1200", openRoundWorkUnits: "345" };
    expect(parseStatus(body).settlement?.queuedWork).toBe(1545n);
    // Informational only: a missing or odd queue stays unknown and never rejects the reading.
    for (const queued of [undefined, null, { closedWorkUnits: "12" }, { closedWorkUnits: 12, openRoundWorkUnits: "1" }, { closedWorkUnits: "-1", openRoundWorkUnits: "0" }]) {
      body.builder.queued = queued;
      expect(parseStatus(body).settlement?.queuedWork).toBeNull();
    }
  });

  it("keeps the settled total unknown when the response leaves it out", () => {
    const body = liveStatusJson();
    delete body.builder.anchor.cumulativeWork;
    expect(parseStatus(body).settlement?.cumulativeWork).toBeNull();
  });

  it("converts rpmMilli to RPM", () => {
    const body = liveStatusJson();
    body.measurement.rpmMilli = 77005;
    expect(parseStatus(body).measurement!.rpm).toBeCloseTo(77.005);
  });

  it("keeps a missing reading as null instead of zero", () => {
    const body = liveStatusJson();
    body.measurement = null;
    expect(parseStatus(body).measurement).toBeNull();
  });

  it("uses only the settled anchor, never the optimistic projection", () => {
    const body = liveStatusJson();
    body.builder.projected.blockHeight = "9999";
    expect(parseStatus(body).settlement!.blockHeight).toBe(4135n);
    body.builder = { status: "unavailable", reason: "no_measurement" };
    expect(parseStatus(body).settlement).toBeNull();
  });

  it("rejects an unknown schema version", () => {
    const body = liveStatusJson();
    body.schemaVersion = 2;
    expect(() => parseStatus(body)).toThrow(UnsupportedSchemaError);
  });

  it.each([
    ["measurement.coreStatus", (b: any) => (b.measurement.coreStatus = "RUNNING")],
    ["measurement.provenance", (b: any) => (b.measurement.provenance = "camera")],
    ["measurement.cumulativeWorkUnits", (b: any) => (b.measurement.cumulativeWorkUnits = 45957)],
    ["measurement.cumulativeWorkUnits", (b: any) => (b.measurement.cumulativeWorkUnits = "045957")],
    ["measurement.rpmMilli", (b: any) => (b.measurement.rpmMilli = -1)],
    ["measurement.rpmMilli", (b: any) => (b.measurement.rpmMilli = 1.5)],
    ["measurement.receivedAt", (b: any) => (b.measurement.receivedAt = "yesterday")],
    ["measurement", (b: any) => delete b.measurement],
  ])("rejects a malformed %s", (path, mutate) => {
    const body = liveStatusJson();
    mutate(body);
    expect(() => parseStatus(body)).toThrow(InvalidStatusError);
    try {
      parseStatus(body);
    } catch (error) {
      expect((error as InvalidStatusError).path).toBe(path);
    }
  });
});

describe("isStale", () => {
  const m = parseStatus(liveStatusJson()).measurement!;

  it("trusts the API's stale flag", () => {
    expect(isStale({ ...m, freshness: "stale" }, m.receivedAt)).toBe(true);
  });

  it("goes stale once staleAfterSeconds pass without a new reading", () => {
    expect(isStale(m, m.receivedAt + 119_000)).toBe(false);
    expect(isStale(m, m.receivedAt + 121_000)).toBe(true);
  });
});
