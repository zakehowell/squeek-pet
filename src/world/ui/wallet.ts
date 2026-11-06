import type { Language } from "../../core/i18n";
import { formatAmount } from "../chain/amount";
import { shortAddress } from "../chain/config";
import { liveClaimable, type ChainSession } from "../chain/session";
import type { WalletOption } from "../chain/wallet";
import { buildingArt } from "../art/world-art";
import { ct } from "../i18n-chain";
import { art, h } from "./dom";
import { LIVE_ATTR, tokenAmount, tokenIcon } from "./chain-parts";
import { card, hint, plainButton } from "./parts";

// The wallet in the World's header, the wallet picker, the card that asks for
// a wallet before the real world opens, and the side card with the player's
// tokens on Sepolia.

export interface WalletUi {
  lang: Language;
  session: ChainSession;
  openPicker(): void;
  disconnect(): void;
  switchChain(): void;
  playTrial(): void;
}

function walletIcon(option: WalletOption | null): HTMLElement {
  if (option?.icon) return h("img", { class: "wallet-ico", src: option.icon, alt: "", width: 16, height: 16 });
  return h("span", { class: "wallet-ico blank", "aria-hidden": "true" });
}

/** The header's wallet button or chip. */
export function walletChip(w: WalletUi): HTMLElement {
  const s = w.session.state;
  if (!s.account) {
    return h(
      "div",
      { class: "wallet-chip" },
      plainButton(ct(w.lang, s.connecting ? "wallet.connecting" : "wallet.connect"), () => w.openPicker(), "btn small primary"),
    );
  }
  const network = w.session.onSepolia
    ? h("span", { class: "net ok" }, h("i", { class: "dot", "aria-hidden": "true" }), ct(w.lang, "wallet.network"))
    : plainButton(ct(w.lang, "wallet.switch"), () => w.switchChain(), "btn small warn");
  return h(
    "div",
    { class: "wallet-chip on" },
    walletIcon(s.wallet),
    h("span", { class: "addr", title: s.account }, shortAddress(s.account)),
    network,
    plainButton(ct(w.lang, "wallet.disconnect"), () => w.disconnect(), "btn small ghost"),
  );
}

/** The choice of wallets, inside the World's own dialog. */
export function walletPicker(w: WalletUi, pick: (option: WalletOption) => void, rescan: () => void): HTMLElement {
  const wallets = w.session.state.wallets;
  const list =
    wallets === null
      ? hint(ct(w.lang, "wallet.looking"))
      : wallets.length
        ? h(
            "ul",
            { class: "wallet-list" },
            ...wallets.map((option) => {
              const button = h("button", { type: "button", class: "btn wallet-pick" }, walletIcon(option), h("span", null, option.name));
              button.addEventListener("click", () => pick(option));
              return h("li", null, button);
            }),
          )
        : h("div", null, hint(ct(w.lang, "wallet.none")), plainButton(ct(w.lang, "wallet.retry"), rescan, "btn small"));
  return h("div", { class: "wallet-picker" }, list, hint(ct(w.lang, "gate.safe"), "hint small"));
}

/** What the real world shows until a wallet is connected. */
export function walletGate(w: WalletUi): HTMLElement {
  const connecting = w.session.state.connecting;
  return card(
    "wallet-gate",
    ct(w.lang, "gate.title"),
    h("div", { class: "gate-body" }, art(buildingArt("windmill", 3), "mill-pic"), h("div", null, h("p", null, ct(w.lang, "gate.body")), hint(ct(w.lang, "gate.steps")))),
    h(
      "div",
      { class: "gate-actions" },
      plainButton(ct(w.lang, connecting ? "wallet.connecting" : "wallet.connect"), () => w.openPicker(), "btn primary"),
      plainButton(ct(w.lang, "gate.trial"), () => w.playTrial(), "btn ghost"),
    ),
    hint(ct(w.lang, "gate.safe"), "hint small"),
  );
}

/** The player's tokens on Sepolia, in the side column. */
export function walletCard(w: WalletUi, now: number): HTMLElement {
  const s = w.session.state;
  const m = s.minter;
  const o = s.overview;
  const rows: HTMLElement[] = [];
  const row = (label: string, value: HTMLElement) => rows.push(h("li", null, h("span", null, label), value));
  if (m && o) {
    row(ct(w.lang, "wallet.sqk"), tokenAmount("SQK", o.sqkBalance));
    row(ct(w.lang, "wallet.sqb"), tokenAmount("SQB", o.sqbBalance));
    row(ct(w.lang, "wallet.staked"), tokenAmount("SQK", m.staked));
    row(
      ct(w.lang, "wallet.claimable"),
      h("span", { class: "tok" }, tokenIcon("SQB"), h("span", { class: "tok-n", [LIVE_ATTR]: "claimable" }, formatAmount(liveClaimable(m, now), 4)), h("span", { class: "tok-sym" }, " SQB")),
    );
    if (s.gas !== null) row(ct(w.lang, "wallet.gas"), h("span", { class: "tok" }, h("span", { class: "tok-n" }, formatAmount(s.gas, 4)), h("span", { class: "tok-sym" }, " ETH")));
  }
  return card(
    "wallet-card",
    ct(w.lang, "wallet.title"),
    rows.length ? h("ul", { class: "wallet-rows" }, ...rows) : hint(ct(w.lang, s.readFailed ? "wallet.readFailed" : "wallet.reading")),
    s.readFailed && rows.length ? hint(ct(w.lang, "wallet.readFailed"), "hint warn small") : null,
  );
}
