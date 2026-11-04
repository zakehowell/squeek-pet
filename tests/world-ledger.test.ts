import { describe, expect, it } from "vitest";
import { FeedError, mergeTurns, parseEventsPage, parseSettlement } from "../src/world/ledger";
import type { LedgerEntry } from "../src/world/types";
import { fixture, turn } from "./world-helpers";

describe("settlement feed", () => {
  it("reads the captured live feed: one turn per settlement, zero-work batches included", () => {
    const page = parseEventsPage(fixture("events-protocol-20261104.json"));
    expect(page.installationId).toBe("stream-game-sepolia-test-20261025-01");
    expect(page.turns).toHaveLength(12);
    const newest = page.turns[0];
    expect(newest).toMatchObject({ from: 1281, to: 1281, work: 0, active: 0 });
    expect(newest.seed).toMatch(/^0x30d4a22d[0-9a-f]+:0x031d4da0[0-9a-f]+:142$/);
    // One settlement certified two rounds at once.
    expect(page.turns.find((t) => t.to === 1278)).toMatchObject({ from: 1277, to: 1278 });
    expect(page.nextCursor).toBeTruthy();
  });

  it("rejects settlements that are not safe, not on Sepolia or malformed", () => {
    const event = fixture("events-protocol-20261104.json").events.find((e: any) => e.type === "system.settlement_completed");
    expect(parseSettlement(event)).not.toBeNull();
    expect(() => parseSettlement({ ...event, source: { ...event.source, confirmationStatus: "latest" } })).toThrow(FeedError);
    expect(() => parseSettlement({ ...event, source: { ...event.source, chainId: "1" } })).toThrow(FeedError);
    expect(() => parseSettlement({ ...event, payload: { ...event.payload, workAdded: 12 } })).toThrow(FeedError);
    expect(() => parseSettlement({ ...event, payload: { ...event.payload, settledThroughRound: "1280" } })).toThrow(FeedError);
    expect(parseSettlement({ ...event, type: "system.mining_checkpointed" })).toBeNull();
  });

  it("rejects a page with another schema or chain", () => {
    const body = fixture("events-protocol-20261104.json");
    expect(() => parseEventsPage({ ...body, schemaVersion: 4 })).toThrow(FeedError);
    expect(() => parseEventsPage({ ...body, chain: { ...body.chain, chainId: "1" } })).toThrow(FeedError);
    expect(() => parseEventsPage({ ...body, status: "unavailable" })).toThrow(FeedError);
  });
});

describe("ledger merge", () => {
  const ids = (entries: LedgerEntry[]) => entries.map((e) => e.id);

  it("adds each settlement once, whatever order the pages arrive in", () => {
    const a = [turn(101, 10), turn(102, 0)];
    const b = [turn(103, 30), turn(104, 0)];
    const first = mergeTurns([], 100, [...b, ...a]);
    expect(ids(first.entries)).toEqual(["turn:101-101", "turn:102-102", "turn:103-103", "turn:104-104"]);
    const again = mergeTurns(first.entries, 100, [...a, ...b, ...a]);
    expect(again.changed).toBe(false);
    expect(again.entries).toEqual(first.entries);
  });

  it("ignores rounds already folded into the checkpoint", () => {
    const merged = mergeTurns([], 102, [turn(101, 10), turn(102, 10), turn(103, 10)]);
    expect(ids(merged.entries)).toEqual(["turn:103-103"]);
  });

  it("marks rounds the feed no longer reaches as a gap that gives nothing", () => {
    const merged = mergeTurns([], 100, [turn(150, 10), turn(151, 0)]);
    expect(merged.entries[0]).toMatchObject({ kind: "gap", from: 101, to: 149 });
    expect(ids(merged.entries).slice(1)).toEqual(["turn:150-150", "turn:151-151"]);
  });

  it("replaces a reorganised settlement and everything built on it", () => {
    const current = mergeTurns([], 100, [turn(101, 10), turn(102, 20), turn(103, 30)]).entries;
    const replacement = turn(102, 25, { id: "turn:102-b", seed: "other" });
    const merged = mergeTurns(current, 100, [replacement]);
    expect(merged.reorg).toBe(true);
    expect(ids(merged.entries)).toEqual(["turn:101-101", "turn:102-b"]);
    // Round 103 comes back with the next read, once.
    const next = mergeTurns(merged.entries, 100, [replacement, turn(103, 30)]);
    expect(ids(next.entries)).toEqual(["turn:101-101", "turn:102-b", "turn:103-103"]);
  });

  it("handles a settlement that now spans rounds that were settled separately", () => {
    const current = mergeTurns([], 100, [turn(101, 10), turn(102, 20)]).entries;
    const merged = mergeTurns(current, 100, [turn(102, 50, { from: 101, id: "turn:101-102" })]);
    expect(merged.reorg).toBe(true);
    expect(ids(merged.entries)).toEqual(["turn:101-102"]);
  });
});
