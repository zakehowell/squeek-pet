// Shapes the pet works with after the official /v1/status response has been
// validated. Large integers stay BigInt; small readings are plain numbers.

export type CoreStatus = "IDLE" | "ACTIVE" | "COUNTER_FAULT";
export type Provenance = "hardware" | "simulated" | "replay" | "derived";
export type Freshness = "online" | "stale";

export interface Measurement {
  freshness: Freshness;
  /** When the device took the reading (ms since epoch). */
  observedAt: number;
  /** When the API accepted the reading (ms since epoch). */
  receivedAt: number;
  staleAfterSeconds: number;
  counterEpoch: string;
  /** Work units counted since the start of counterEpoch. */
  cumulativeWorkUnits: bigint;
  provenance: Provenance;
  coreStatus: CoreStatus;
  /** Revolutions per minute (rpmMilli / 1000). */
  rpm: number;
  speedMmPerSecond: number;
  /** Distance the device reports for its current day. */
  distanceMm: number;
}

/** The settled frontier on SqueekCore (builder.anchor). Never the optimistic projection. */
export interface Settlement {
  blockHeight: bigint;
  settledThroughRound: bigint;
  /** Work units SqueekCore has settled in total; null when the response leaves it out. */
  cumulativeWork?: bigint | null;
  confirmedAt: number | null;
  transactionHash: string | null;
}

export interface StatusSnapshot {
  installationId: string;
  revision: string;
  generatedAt: number;
  measurement: Measurement | null;
  settlement: Settlement | null;
  /** "demo" snapshots come from the local scripted demo and must always be labelled. */
  source: "api" | "demo";
}

export type FetchFailure =
  | { kind: "network"; message: string }
  | { kind: "http"; status: number; retryAfterMs: number | null }
  | { kind: "rate_limited"; retryAfterMs: number }
  | { kind: "invalid"; message: string }
  | { kind: "unsupported_schema"; schemaVersion: unknown };

export type FetchOutcome =
  | { ok: true; snapshot: StatusSnapshot; changed: boolean }
  | { ok: false; failure: FetchFailure };
