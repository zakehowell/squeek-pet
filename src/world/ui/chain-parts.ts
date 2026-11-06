import { sqbIcon, sqkIcon } from "../art/chain-art";
import { formatAmount, inputAmount, parseAmount } from "../chain/amount";
import { shortAddress, txUrl, addressUrl } from "../chain/config";
import type { Busy, ChainState } from "../chain/session";
import type { Hex } from "../chain/codec";
import { ct, type ChainKey } from "../i18n-chain";
import { art, h, type Child } from "./dom";
import type { View } from "./parts";

// What the on-chain parts of the World draw from, and their shared widgets:
// token amounts with their coins, amount fields, and the line that follows a
// transaction from the wallet to Sepolia.

export interface ChainView {
  s: ChainState;
  onSepolia: boolean;
  /** Now, ms, for amounts that count up between reads. */
  now: number;
  switchChain(): void;
  stake(amount: bigint): void;
  unstake(amount: bigint): void;
  claim(): void;
  sync(): void;
  drip(): void;
  buyDeed(price: bigint): void;
  nameDeed(deed: number, name: string): void;
  renovate(deed: number, level: number, price: bigint): void;
  /** Joins on Sepolia, then in the world. */
  joinGuild(chainGuild: number, season: number): void;
  /** Founds a guild on Sepolia and joins it for `joinSeason` (0: not yet). */
  foundGuild(name: string, flag: number, perk: number, joinSeason: number): void;
  supply(amount: bigint): void;
  buyDecoration(index: number): void;
  /** Adds the bed of a deed the player holds to their world. */
  placeDeed(deed: number): void;
}

export const ctr = (v: View, key: ChainKey, values?: Record<string, string | number>) => ct(v.lang, key, values);

export type Token = "SQK" | "SQB";

/** "1,234.5 SQK" with the coin in front. */
export function tokenAmount(token: Token, wei: bigint, places = 2, cls = "tok"): HTMLElement {
  return h(
    "span",
    { class: cls, title: `${formatAmount(wei, 6)} ${token}` },
    art(token === "SQK" ? sqkIcon() : sqbIcon(), "tok-ico"),
    h("span", { class: "tok-n" }, formatAmount(wei, places)),
    h("span", { class: "tok-sym" }, ` ${token}`),
  );
}

export function tokenIcon(token: Token): HTMLElement {
  return art(token === "SQK" ? sqkIcon() : sqbIcon(), "tok-ico");
}

/** A number with a label, for the big figures at the top of a card. */
export function stat(label: string, value: Child, note?: Child, cls = ""): HTMLElement {
  return h("div", { class: `stat ${cls}`.trim() }, h("span", { class: "label" }, label), h("strong", { class: "stat-value" }, value), note ? h("span", { class: "stat-note" }, note) : null);
}

/**
 * An amount field. What the player types is kept in `v.ui.form[key]`, so a
 * redraw doesn't lose it; Max fills in `max`.
 */
export function amountField(v: View, key: string, label: string, max: bigint | null): { field: HTMLElement; read(): bigint | null } {
  const input = h("input", {
    type: "text",
    inputmode: "decimal",
    autocomplete: "off",
    spellcheck: "false",
    class: "amount-input",
    "aria-label": label,
    placeholder: "0",
    name: key,
  });
  input.value = v.ui.form[key] ?? "";
  input.addEventListener("input", () => {
    v.ui.form[key] = input.value;
  });
  const maxButton =
    max !== null
      ? h(
          "button",
          {
            type: "button",
            class: "btn small ghost max",
            onclick: () => {
              input.value = inputAmount(max);
              v.ui.form[key] = input.value;
              input.focus();
            },
          },
          ctr(v, "stake.max"),
        )
      : null;
  return {
    field: h("div", { class: "amount-field" }, input, maxButton),
    read: () => parseAmount(input.value),
  };
}

/** Sends `amount` on, or says what's wrong with it. */
export function submitAmount(v: View, amount: bigint | null, max: bigint, go: (amount: bigint) => void) {
  const warn = (key: ChainKey) => v.toast(ctr(v, key), "warn");
  if (amount === null) return warn("err.amount");
  if (amount === 0n) return warn("err.ZeroAmount");
  if (amount > max) return warn("err.tooMuch");
  go(amount);
}

/** A button for an on-chain action: off while another transaction runs or the wallet is elsewhere. */
export function chainButton(v: View, label: string, onClick: () => void, options: { primary?: boolean; small?: boolean; blocked?: string | null } = {}): HTMLButtonElement {
  const busy = v.chain?.s.busy;
  const blocked = options.blocked ?? (busy ? ct(v.lang, "err.busy") : null);
  const cls = ["btn", options.primary ? "primary" : "", options.small ? "small" : ""].filter(Boolean).join(" ");
  const button = h("button", { type: "button", class: cls, disabled: blocked !== null, title: blocked }, label);
  button.addEventListener("click", onClick);
  return button;
}

const BUSY_KEYS: Record<Busy["step"], ChainKey> = {
  wallet: "busy.wallet",
  sign: "busy.sign",
  approve: "busy.approve",
  send: "busy.send",
  confirm: "busy.confirm",
};

/** The transaction in flight, if it belongs to one of `actions`. */
export function busyLine(v: View, actions: readonly Busy["action"][]): HTMLElement | null {
  const busy = v.chain?.s.busy;
  if (!busy || !actions.includes(busy.action)) return null;
  return h(
    "p",
    { class: "busy-line", role: "status" },
    h("span", { class: "spinner", "aria-hidden": "true" }),
    ctr(v, BUSY_KEYS[busy.step]),
    busy.hash ? externalLink(v, txUrl(v.chain!.s.config, busy.hash), ctr(v, "busy.view")) : null,
  );
}

export function externalLink(v: View, href: string, label: string): HTMLAnchorElement {
  const a = h("a", { href, target: "_blank", rel: "noopener noreferrer", class: "ext" }, `${label} ↗`);
  a.addEventListener("click", (event) => {
    event.preventDefault();
    v.openUrl(href);
  });
  return a;
}

export function addressLink(v: View, address: Hex, label = shortAddress(address)): HTMLAnchorElement {
  return externalLink(v, addressUrl(v.chain!.s.config, address), label);
}

/** The wallet needs Sepolia before any transaction: a one-line switch. */
export function chainNotice(v: View): HTMLElement | null {
  if (!v.chain || v.chain.onSepolia) return null;
  return h("div", { class: "chain-notice" }, h("span", null, ctr(v, "wallet.wrongChain")), chainButton(v, ctr(v, "wallet.switch"), () => v.chain!.switchChain(), { small: true, primary: true }));
}

/** Ticks a number shown with `data-live` between reads, without redrawing the page. */
export const LIVE_ATTR = "data-live";

// Names on the town map and guild names are anyone's text. They are drawn as
// text, never markup; this also drops the invisible and direction-changing
// characters that could make one name look like another.
const HIDDEN = /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u115f\u1160\u17b4\u17b5\u180e\u200b-\u200f\u202a-\u202e\u2060-\u206f\u3164\ufe00-\ufe0f\ufeff\uffa0\ufff0-\ufffb]/g;

export function displayName(name: string): string {
  return name.replace(HIDDEN, "").trim();
}

/** Why WorldShop would refuse `name` (1 to 32 bytes, no space at either end), or null. */
export function nameProblem(name: string): ChainKey | null {
  const bytes = new TextEncoder().encode(name).length;
  if (bytes < 1 || bytes > 32 || name !== name.trim() || displayName(name) !== name) return "err.BadName";
  return null;
}
