import { formatAgo, formatClock, formatDistance, formatInteger, formatRpm, formatSpeed } from "../core/format";
import { t, type Language, type MessageKey } from "../core/i18n";
import type { Effect, PetState } from "../core/pet-machine";
import type { Provenance } from "../core/types";

// Words and numbers shown around the pet. Pure functions of the pet state, so
// the same state always reads the same way and can be tested without a DOM.

export const EXPLORER = "https://eth-sepolia.blockscout.com";
export const PULSE_URL = "https://squeekpulse.xyz/";
export const DOCS_URL = "https://docs.squeekchain.com/developers/api/";

export type BadgeTone = "live" | "label" | "offline";
export interface Badge {
  text: string;
  tone: BadgeTone;
}

export interface Row {
  label: string;
  value: string;
  note?: string;
}

export interface BubbleContent {
  title: string;
  badge: Badge | null;
  status: string;
  note: string | null;
  rows: Row[];
  foot: string;
}

export interface PanelContent {
  title: string;
  badge: Badge | null;
  rows: Row[];
  /** When the shown reading was taken. */
  reading: string | null;
  tx: { label: string; url: string } | null;
  source: string;
}

export interface ToastContent {
  text: string;
  tone: "plain" | "blue" | "gold";
  action: { label: string; url: string } | null;
}

const PROVENANCE_BADGE: Record<Provenance, MessageKey> = {
  hardware: "badge.live",
  simulated: "badge.simulated",
  replay: "badge.replay",
  derived: "badge.derived",
};

/** Server time, so "updated 3s ago" stays right even when the local clock is off. */
const serverNow = (state: PetState, now: number) => now + state.clockOffsetMs;

/** Live hardware gets LIVE; demo and any non-hardware provenance are always labelled. */
export function badgeFor(state: PetState, lang: Language): Badge | null {
  if (state.mode === "offline") return { text: t(lang, "badge.offline"), tone: "offline" };
  const snap = state.snapshot;
  if (!snap?.measurement) return null;
  if (snap.source === "demo") return { text: t(lang, "badge.demo"), tone: "label" };
  const provenance = snap.measurement.provenance;
  return { text: t(lang, PROVENANCE_BADGE[provenance]), tone: provenance === "hardware" ? "live" : "label" };
}

/**
 * The "watch live on X" pill only offers itself while the real hamster runs:
 * live hardware data in running mode. Demo, simulated, replayed and stale
 * data never claim a broadcast.
 */
export function offersLiveStream(state: PetState): boolean {
  return state.mode === "running" && badgeFor(state, "en")?.tone === "live";
}

/** The always-visible tag on the pet itself: only for data that is not live hardware. */
export function petLabel(state: PetState, lang: Language): string | null {
  const badge = badgeFor(state, lang);
  return badge?.tone === "label" ? badge.text : null;
}

function sourceLine(state: PetState, lang: Language): string {
  const snap = state.snapshot;
  if (snap?.source === "demo") return t(lang, "bubble.demoSource");
  const provenance = snap?.measurement?.provenance ?? "hardware";
  return t(lang, "bubble.source", { source: t(lang, `source.${provenance}` as MessageKey) });
}

function wheelText(state: PetState, lang: Language, panel: boolean): string {
  const m = state.snapshot?.measurement;
  switch (state.mode) {
    case "loading":
      return t(lang, "hover.loading");
    case "offline":
      return panel ? t(lang, "panel.wheelUnknown") : t(lang, "hover.offline");
    case "fault":
      return panel ? t(lang, "panel.wheelFault") : t(lang, "hover.fault");
    default:
      if (m?.coreStatus === "ACTIVE") {
        return panel ? t(lang, "panel.wheelRunning", { rpm: formatRpm(m.rpm) }) : t(lang, "hover.running", { rpm: formatRpm(m.rpm) });
      }
      if (state.mode === "eating" && !panel) return t(lang, "hover.eating");
      return panel ? t(lang, "panel.wheelIdle") : t(lang, "hover.sleeping");
  }
}

export function bubbleContent(state: PetState, now: number, lang: Language): BubbleContent {
  const m = state.snapshot?.measurement ?? null;
  const rows: Row[] = [];
  let note: string | null = null;
  const ago = m ? formatAgo(serverNow(state, now) - m.observedAt, lang) : null;

  if (state.mode === "offline") {
    note = state.offlineReason ? t(lang, `offline.${state.offlineReason}` as MessageKey) : null;
  } else if (state.mode !== "loading" && m) {
    if (state.mode === "sleeping") note = t(lang, "hover.sleepingNote");
    if (m.coreStatus === "ACTIVE") rows.push({ label: t(lang, "panel.speed"), value: formatSpeed(m.speedMmPerSecond) });
    rows.push({ label: t(lang, "bubble.today"), value: formatDistance(m.distanceMm, lang) });
    rows.push({ label: t(lang, "bubble.work"), value: t(lang, "bubble.workValue", { n: formatInteger(state.sessionWork, lang) }) });
    if (state.beans + state.extraBeans > 0) {
      rows.push({ label: "", value: t(lang, "hover.beans", { n: String(state.beans + state.extraBeans) }) });
    }
  }
  if (ago && state.mode !== "loading") {
    rows.push({ label: t(lang, "bubble.sync"), value: ago });
  } else if (state.mode === "offline") {
    rows.push({ label: t(lang, "bubble.sync"), value: t(lang, "hover.noReading") });
  }

  return {
    title: t(lang, "panel.title"),
    badge: badgeFor(state, lang),
    status: wheelText(state, lang, false),
    note,
    rows,
    foot: sourceLine(state, lang),
  };
}

export function txUrl(hash: string): string {
  return `${EXPLORER}/tx/${hash}`;
}

export function panelContent(state: PetState, now: number, lang: Language): PanelContent {
  const snap = state.snapshot;
  const m = snap?.measurement ?? null;
  const s = snap?.settlement ?? null;
  const rows: Row[] = [{ label: t(lang, "panel.wheel"), value: wheelText(state, lang, true) }];
  if (m) {
    rows.push({ label: t(lang, "panel.speed"), value: formatSpeed(m.speedMmPerSecond) });
    rows.push({ label: t(lang, "panel.distance"), value: formatDistance(m.distanceMm, lang) });
    rows.push({ label: t(lang, "panel.work"), value: formatInteger(m.cumulativeWorkUnits, lang), note: t(lang, "panel.workNote") });
  }
  rows.push({ label: t(lang, "panel.session"), value: t(lang, "panel.sessionValue", { n: formatInteger(state.sessionWork, lang) }) });
  if (s) {
    rows.push({
      label: t(lang, "panel.blocks"),
      value: `#${formatInteger(s.blockHeight, lang)}`,
      note: s.confirmedAt ? t(lang, "panel.confirmed", { ago: formatAgo(serverNow(state, now) - s.confirmedAt, lang) }) : undefined,
    });
  }
  return {
    title: t(lang, "panel.title"),
    badge: badgeFor(state, lang),
    rows,
    reading: m
      ? `${t(lang, "panel.updated")} ${formatClock(m.observedAt, lang)} · ${formatAgo(serverNow(state, now) - m.observedAt, lang)}`
      : null,
    tx: s?.transactionHash && snap?.source === "api" ? { label: t(lang, "panel.viewTx"), url: txUrl(s.transactionHash) } : null,
    source: snap?.source === "demo" ? t(lang, "panel.demoSource") : t(lang, "panel.source"),
  };
}

/** Text for a state-machine toast. Labels non-hardware starts with the data's own badge. */
export function toastContent(effect: Extract<Effect, { type: "toast" }>, state: PetState, lang: Language): ToastContent {
  const values = { ...effect.values };
  if (effect.key === "startedRunningLabelled") values.label = badgeFor(state, lang)?.text ?? t(lang, "badge.simulated");
  if (effect.key === "meal" && values.n) values.n = formatInteger(BigInt(values.n), lang);
  const text = t(lang, `toast.${effect.key}` as MessageKey, values);
  if (effect.key === "blocks") {
    const hash = state.celebration?.transactionHash ?? null;
    const live = state.snapshot?.source === "api";
    return { text, tone: "gold", action: hash && live ? { label: t(lang, "toast.viewTx"), url: txUrl(hash) } : null };
  }
  return { text, tone: effect.key === "meal" ? "blue" : "plain", action: null };
}
