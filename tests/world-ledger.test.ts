import { describe, expect, it } from "vitest";
import { FeedError, mergeTurns, parseEventsPage, parseSettlement } from "../src/world/ledger";
import type { LedgerEntry } from "../src/world/types";
import { PROTOCOL_FIXTURE, RELEASE, fixture, settlementEvent, turn } from "./world-helpers";

describe("settlement feed", () => {
  it("reads the captured live feed: one turn per settlement, zero-work batches included", () => {
    const page = parseEventsPage(fixture(PROTOCOL_FIXTURE));
    expect(page.installationId).toBe("sepolia-core-sepolia-20261103");
    expect(page.release).toBe(RELEASE);
    // 40 events: 20 settlements and the 20 SqueekMining checkpoints between them.
    expect(page.turns).toHaveLength(20);
    const newest = page.turns[0];
    expect(newest).toMatchObject({ from: 307, to: 307, work: 0, active: 0 });
    expect(newest.seed).toMatch(/^0x3e535b7b[0-9a-f]+:0x2f7abdd3[0-9a-f]+:1387$/);
    expect(page.nextCursor).toBeTruthy();
  });

  it("reads a settlement that certified several rounds at once", () => {
    const turn = parseSettlement(settlementEvent(277, 278, 640, Date.parse("2026-11-05T12:00:00Z")), RELEASE);
    expect(turn).toMatchObject({ from: 277, to: 278, work: 640, active: 1 });
  });

  it("rejects settlements that are not safe, not on Sepolia, from another release or malformed", () => {
    const event = fixture(PROTOCOL_FIXTURE).events.find((e: any) => e.type === "system.settlement_completed");
    expect(parseSettlement(event, RELEASE)).not.toBeNull();
    expect(() => parseSettlement({ ...event, source: { ...event.source, confirmationStatus: "latest" } })).toThrow(FeedError);
    expect(() => parseSettlement({ ...event, source: { ...event.source, chainId: "1" } })).toThrow(FeedError);
    expect(() => parseSettlement({ ...event, source: { ...event.source, contractAddress: "0x980b" } })).toThrow(FeedError);
    expect(() => parseSettlement(event, "stream-game-sepolia-test-20261025-01")).toThrow(FeedError);
    expect(() => parseSettlement({ ...event, eventVersion: 1 })).toThrow(FeedError);
    expect(() => parseSettlement({ ...event, payload: { ...event.payload, workAdded: 12 } })).toThrow(FeedError);
    expect(() => parseSettlement({ ...event, payload: { ...event.payload, settledThroughRound: "306" } })).toThrow(FeedError);
    expect(parseSettlement({ ...event, type: "system.mining_checkpointed" })).toBeNull();
  });

  it("rejects a page with another schema, chain or no release", () => {
    const body = fixture(PROTOCOL_FIXTURE);
    // Schema 3 is the feed before release core-sepolia-20261103.
    expect(() => parseEventsPage({ ...body, schemaVersion: 3 })).toThrow(FeedError);
    expect(() => parseEventsPage({ ...body, chain: { ...body.chain, chainId: "1" } })).toThrow(FeedError);
    expect(() => parseEventsPage({ ...body, status: "unavailable" })).toThrow(FeedError);
    expect(() => parseEventsPage({ ...body, release: undefined })).toThrow(FeedError);
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
