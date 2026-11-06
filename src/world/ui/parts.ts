import type { Language } from "../../core/i18n";
import { RESOURCES, type Cost } from "../data";
import { check } from "../engine";
import { amount, errorText, num, resourceName, ui, type UiKey } from "../i18n";
import { resIcon } from "../art/icons";
import type { SharedBoss } from "../boss";
import type { WorldKind } from "../store";
import type { Choice, GearId, ResourceId, RouteId, WorldState } from "../types";
import { art, h, type Child } from "./dom";
import type { ChainView } from "./chain-parts";

// What every part of the World page draws from, and the small widgets they share.

export type Tab = "home" | "adventure" | "log" | "guild" | "stake" | "town";

/** Page-only state: nothing here changes the world. */
export interface UiState {
  tab: Tab;
  /** The bed whose seed picker is open. */
  picking: number | null;
  route: RouteId | null;
  gear: GearId[];
  snack: boolean;
  charm: boolean;
  /** How many log entries are shown. */
  logShown: number;
  /** What the player typed in the on-chain forms, kept across redraws. */
  form: Record<string, string>;
  /** The plot picked on the town map. */
  plot: number | null;
  /** The banner being designed in "Found a guild". */
  flag: number;
  perk: number;
}

export type BossRead = { state: "loading" } | { state: "error" } | { state: "ready"; boss: SharedBoss };

export interface View {
  lang: Language;
  kind: WorldKind;
  world: WorldState;
  /** This season's shared boss. */
  boss: BossRead;
  /** Whether a season's boss was defeated: null while the public data hasn't settled it. */
  defeated(season: number): boolean | null;
  ui: UiState;
  /** Checks a choice, records it in the save and redraws; with `confirm`, asks first. */
  act(choice: Choice, confirm?: string): void;
  /** Redraws after a change to `ui`. */
  redraw(): void;
  openUrl(url: string): void;
  /** A short message at the bottom of the World. */
  toast(text: string, tone?: "ok" | "warn" | "news"): void;
  /** Sepolia, in the real world once the World's contracts are set up and a wallet is connected. */
  chain: ChainView | null;
}

export const tr = (v: View, key: UiKey, values?: Record<string, string | number>) => ui(v.lang, key, values);

export function card(cls: string, title: string | null, ...children: Child[]): HTMLElement {
  return h("section", { class: `card ${cls}`.trim() }, title ? h("h2", null, title) : null, ...children);
}

/** A resource and how many, with its picture. `short` marks what the bag lacks. */
export function chip(lang: Language, res: ResourceId, n: number, short = false): HTMLElement {
  return h(
    "span",
    { class: short ? "chip short" : "chip", title: amount(lang, res, n) },
    art(resIcon(res), "chip-ico"),
    h("span", { class: "chip-n" }, num(lang, n)),
    h("span", { class: "sr-only" }, ` ${resourceName(lang, res)}`),
  );
}

/** A price, each part red when the bag doesn't hold enough of it. */
export function costChips(v: View, cost: Cost): HTMLElement {
  const parts = RESOURCES.filter((res) => (cost[res] ?? 0) > 0).map((res) => chip(v.lang, res, cost[res]!, v.world.res[res] < cost[res]!));
  return h("span", { class: "cost" }, ...(parts.length ? parts : [h("span", { class: "free" }, v.lang === "zh" ? "免费" : "Free")]));
}

/** A reward list, never red. */
export function rewardChips(lang: Language, cost: Cost): HTMLElement {
  return h("span", { class: "cost" }, ...RESOURCES.filter((res) => (cost[res] ?? 0) > 0).map((res) => chip(lang, res, cost[res]!)));
}

export function bar(fraction: number, cls = ""): HTMLElement {
  const pct = Math.max(0, Math.min(1, fraction)) * 100;
  const fill = h("span", { class: "bar-fill" });
  fill.style.width = `${pct.toFixed(1)}%`;
  return h("div", { class: `bar ${cls}`.trim(), role: "presentation" }, fill);
}

/** A button for a choice: disabled, with the reason as its tooltip, when the rules say no. */
export function choiceButton(
  v: View,
  label: string,
  choice: Choice,
  options: { primary?: boolean; confirm?: string; small?: boolean; blocked?: string | null } = {},
): HTMLButtonElement {
  const why = check(v.world, choice);
  const cls = ["btn", options.primary ? "primary" : "", options.small ? "small" : ""].filter(Boolean).join(" ");
  const blocked = why ? errorText(v.lang, why) : (options.blocked ?? null);
  const button = h("button", { type: "button", class: cls, disabled: blocked !== null, title: blocked }, label);
  button.addEventListener("click", () => v.act(choice, options.confirm));
  return button;
}

export function plainButton(label: string, onClick: () => void, cls = "btn"): HTMLButtonElement {
  const button = h("button", { type: "button", class: cls }, label);
  button.addEventListener("click", onClick);
  return button;
}

/**
 * A segmented picker. Each option is a toggle button: picking a guild class or
 * action is a move in the game, so it waits for Enter or Space instead of
 * following the arrow keys as a radio group would.
 */
export function segmented<T extends string>(label: string, value: T, options: readonly [T, string][], onPick: (value: T) => void): HTMLElement {
  const group = h("div", { class: "segmented", role: "group", "aria-label": label });
  for (const [option, text] of options) {
    const button = h("button", { type: "button", "aria-pressed": String(option === value), class: option === value ? "on" : "" }, text);
    button.addEventListener("click", () => {
      if (option !== value) onPick(option);
    });
    group.append(button);
  }
  return group;
}

export const hint = (text: string, cls = "hint") => h("p", { class: cls }, text);

/** Sentences side by side: Chinese runs them together, English puts a space between. */
export const sentences = (v: View, ...parts: string[]) => parts.join(v.lang === "zh" ? "" : " ");
