import { readFileSync } from "node:fs";
import { SEASON_EPOCH } from "../src/world/data";
import type { StorageLike } from "../src/world/store";
import type { Turn } from "../src/world/types";

/** A moment inside season 1 (Wednesday 4 November 2026, 12:00 UTC). */
export const T = SEASON_EPOCH + 2 * 24 * 3600 * 1000;
export const ROUND = 600_000;

/** A settled turn for round `to` (or rounds from..to), timed `ROUND` apart from T. */
export function turn(to: number, work: number, options: Partial<Turn> = {}): Turn {
  const from = options.from ?? to;
  return {
    kind: "turn",
    id: `turn:${from}-${to}`,
    from,
    to,
    active: work > 0 ? Math.min(to - from + 1, 1) : 0,
    work,
    blocks: Math.floor(work / 1000),
    height: 1000 + to,
    at: T + to * ROUND,
    tx: `0x${to.toString(16).padStart(64, "0")}`,
    seed: `0xseed${to}:0xtx${to}:7`,
    ...options,
  };
}

export function memoryStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
  };
}

export function fixture(name: string): Record<string, any> {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** The live protocol feed captured on 2026-11-05: events schema 4, release core-sepolia-20261103. */
export const PROTOCOL_FIXTURE = "events-protocol-20261105.json";
/** SqueekCore in release core-sepolia-20261103 (docs.squeekchain.com/assets/deployments/sepolia.json). */
export const CORE = "0xfd6c166d4b8e2962e65746a13e5a0797cd4de0c4";
export const RELEASE = "core-sepolia-20261103";

/** An events page with the fixture's envelope and the given events. */
export function eventsPage(events: unknown[], nextCursor: string | null = null, base = fixture(PROTOCOL_FIXTURE)) {
  return { ...base, events, nextCursor };
}

/** A settlement event shaped like the live feed's (eventVersion 2), for rounds from..to. */
export function settlementEvent(from: number, to: number, work: number, at: number, hash = "ab") {
  const tx = `0x${hash.repeat(32).slice(0, 64)}${""}`;
  return {
    id: `chain:11155111:${CORE}:${tx}:${to}:system.settlement_completed`,
    eventVersion: 2,
    occurredAt: new Date(at).toISOString(),
    recordedAt: new Date(at).toISOString(),
    source: {
      kind: "chain",
      chainId: "11155111",
      target: "sepolia",
      releaseId: RELEASE,
      contractAddress: CORE,
      blockNumber: String(12_100_000 + to),
      blockHash: `0x${(hash + "cd").repeat(16).slice(0, 64)}`,
      transactionHash: tx,
      transactionIndex: "3",
      logIndex: String(to % 200),
      confirmationStatus: "safe",
    },
    type: "system.settlement_completed",
    payload: {
      previousSettledThroughRound: String(from - 1),
      settledThroughRound: String(to),
      activeRoundCount: work > 0 ? "1" : "0",
      workAdded: String(work),
      completedBlockCount: "0",
      firstCompletedBlock: null,
      lastCompletedBlock: null,
      cumulativeWork: "3817",
      cumulativeBlockUnits: "366425653103",
      blockHeight: "366",
    },
  };
}
