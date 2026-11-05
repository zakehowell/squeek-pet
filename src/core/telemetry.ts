import type { CoreStatus, Freshness, Measurement, Provenance, Settlement, StatusSnapshot } from "./types";

// Validates the official GET /v1/status response (schemaVersion 1).
// Anything missing or malformed is rejected rather than guessed: an unknown
// reading must stay unknown, never become a zero.

export class InvalidStatusError extends Error {
  constructor(readonly path: string, detail: string) {
    super(`${path}: ${detail}`);
    this.name = "InvalidStatusError";
  }
}

export class UnsupportedSchemaError extends Error {
  constructor(readonly schemaVersion: unknown) {
    super(`Unsupported /v1/status schemaVersion ${String(schemaVersion)}`);
    this.name = "UnsupportedSchemaError";
  }
}

const CORE_STATUSES: readonly CoreStatus[] = ["IDLE", "ACTIVE", "COUNTER_FAULT"];
const PROVENANCES: readonly Provenance[] = ["hardware", "simulated", "replay", "derived"];
const FRESHNESS: readonly Freshness[] = ["online", "stale"];
const DECIMAL = /^(0|[1-9][0-9]*)$/;

type Json = Record<string, unknown>;

function object(value: unknown, path: string): Json {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new InvalidStatusError(path, "expected an object");
  }
  return value as Json;
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) throw new InvalidStatusError(path, "expected a non-empty string");
  return value;
}

function decimal(value: unknown, path: string): bigint {
  if (typeof value !== "string" || !DECIMAL.test(value)) throw new InvalidStatusError(path, "expected a decimal string");
  return BigInt(value);
}

function integer(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new InvalidStatusError(path, "expected a non-negative integer");
  }
  return value;
}

function timestamp(value: unknown, path: string): number {
  const text = string(value, path);
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) throw new InvalidStatusError(path, "expected an ISO timestamp");
  return ms;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    throw new InvalidStatusError(path, `expected one of ${allowed.join(", ")}`);
  }
  return value as T;
}

function parseMeasurement(value: unknown): Measurement | null {
  if (value === null) return null;
  const m = object(value, "measurement");
  return {
    freshness: oneOf(m.freshness, FRESHNESS, "measurement.freshness"),
    observedAt: timestamp(m.observedAt, "measurement.observedAt"),
    receivedAt: timestamp(m.receivedAt, "measurement.receivedAt"),
    staleAfterSeconds: integer(m.staleAfterSeconds, "measurement.staleAfterSeconds"),
    counterEpoch: string(m.counterEpoch, "measurement.counterEpoch"),
    cumulativeWorkUnits: decimal(m.cumulativeWorkUnits, "measurement.cumulativeWorkUnits"),
    provenance: oneOf(m.provenance, PROVENANCES, "measurement.provenance"),
    coreStatus: oneOf(m.coreStatus, CORE_STATUSES, "measurement.coreStatus"),
    rpm: integer(m.rpmMilli, "measurement.rpmMilli") / 1000,
    speedMmPerSecond: integer(m.speedMmPerSecond, "measurement.speedMmPerSecond"),
    distanceMm: integer(m.distanceMm, "measurement.distanceMm"),
  };
}

function parseSettlement(value: unknown): Settlement | null {
  if (value === undefined || value === null) return null;
  const builder = object(value, "builder");
  if (builder.status !== "available") return null;
  const anchor = object(builder.anchor, "builder.anchor");
  return {
    blockHeight: decimal(anchor.blockHeight, "builder.anchor.blockHeight"),
    settledThroughRound: decimal(anchor.settledThroughRound, "builder.anchor.settledThroughRound"),
    cumulativeWork: anchor.cumulativeWork === undefined ? null : decimal(anchor.cumulativeWork, "builder.anchor.cumulativeWork"),
    confirmedAt: anchor.confirmedAt == null ? null : timestamp(anchor.confirmedAt, "builder.anchor.confirmedAt"),
    transactionHash: typeof anchor.transactionHash === "string" ? anchor.transactionHash : null,
  };
}

export function parseStatus(body: unknown): StatusSnapshot {
  const root = object(body, "$");
  if (root.schemaVersion !== 1) throw new UnsupportedSchemaError(root.schemaVersion);
  if (!("measurement" in root)) throw new InvalidStatusError("measurement", "missing");
  return {
    installationId: string(root.installationId, "installationId"),
    revision: string(root.revision, "revision"),
    generatedAt: timestamp(root.generatedAt, "generatedAt"),
    measurement: parseMeasurement(root.measurement),
    settlement: parseSettlement(root.builder),
    source: "api",
  };
}

/**
 * A reading counts as stale when the API says so, or when more than
 * staleAfterSeconds have passed since it was received (for example while
 * the network is down and no new response arrives).
 */
export function isStale(measurement: Measurement, now: number): boolean {
  if (measurement.freshness === "stale") return true;
  return now - measurement.receivedAt > measurement.staleAfterSeconds * 1000;
}
