import { buildingArt } from "../art/world-art";
import { formatAmount } from "../chain/amount";
import { dailyRate, liveClaimable } from "../chain/session";
import { duration, num } from "../i18n";
import { art, h } from "./dom";
import { addressLink, amountField, busyLine, chainButton, chainNotice, ctr, LIVE_ATTR, stat, submitAmount, tokenAmount, tokenIcon, type ChainView } from "./chain-parts";
import { card, hint, type View } from "./parts";

// The Stake tab: stake test SQK in SqbMinter and mine SQB as the real
// hamster's work settles; the testnet SQK faucet; the whole mill's numbers.

export function stakeView(v: View): HTMLElement[] {
  const c = v.chain!;
  if (!c.s.minter) return [card("stake-main", ctr(v, "stake.title"), hint(c.s.readFailed ? ctr(v, "wallet.readFailed") : ctr(v, "wallet.reading")))];
  return [mill(v, c), faucet(v, c), everyone(v, c)];
}

function percent(part: bigint, whole: bigint): string {
  if (!whole) return "0%";
  const bp = Number((part * 10_000n) / whole);
  return `${(bp / 100).toFixed(bp % 100 ? 2 : 0)}%`;
}

function mill(v: View, c: ChainView): HTMLElement {
  const m = c.s.minter!;
  const claimable = liveClaimable(m, c.now);
  const perDay = dailyRate(m, c.now);
  const flowing = m.ratePerSecond > 0n && c.now < m.streamEnds * 1000;

  const head = h(
    "div",
    { class: "mill-head" },
    art(buildingArt("windmill", 3), "mill-pic"),
    h(
      "div",
      { class: "stats" },
      stat(ctr(v, "stake.staked"), tokenAmount("SQK", m.staked)),
      stat(
        ctr(v, "stake.claimable"),
        h("span", { class: "tok" }, tokenIcon("SQB"), h("span", { class: "tok-n", [LIVE_ATTR]: "claimable" }, formatAmount(claimable, 4)), h("span", { class: "tok-sym" }, " SQB")),
      ),
      stat(ctr(v, "stake.share"), percent(m.staked, m.totalStaked)),
      stat(ctr(v, "stake.rate"), ctr(v, "stake.perDay", { n: formatAmount(perDay, 2) })),
    ),
  );

  const notes: HTMLElement[] = [];
  if (m.pause !== "none") notes.push(hint(ctr(v, "stake.paused", { reason: ctr(v, `pause.${m.pause}`) }), "hint warn"));
  else {
    notes.push(
      hint(
        flowing
          ? ctr(v, "stake.flowing", { n: formatAmount(m.ratePerSecond * 86_400n, 2), time: duration(v.lang, m.streamEnds * 1000 - c.now) })
          : ctr(v, "stake.idle"),
      ),
    );
    if (m.pendingWork > 0) {
      notes.push(
        h(
          "div",
          { class: "pending-work" },
          h("p", null, ctr(v, "stake.pending", { n: num(v.lang, m.pendingWork), sqb: formatAmount(BigInt(m.pendingWork) * 10n ** 17n, 1) })),
          chainButton(v, ctr(v, "stake.sync"), () => c.sync(), { small: true }),
        ),
      );
    }
  }

  const stakeForm = amountField(v, "stake", ctr(v, "stake.amount"), m.sqkBalance);
  const unstakeForm = amountField(v, "unstake", ctr(v, "stake.amount"), m.staked);
  const forms = h(
    "div",
    { class: "stake-forms" },
    h(
      "div",
      { class: "stake-form" },
      h("h3", null, ctr(v, "stake.stake")),
      stakeForm.field,
      h("p", { class: "muted small" }, ctr(v, "stake.inWallet", { n: formatAmount(m.sqkBalance, 2) })),
      chainButton(v, ctr(v, "stake.stake"), () => submitAmount(v, stakeForm.read(), m.sqkBalance, (amount) => c.stake(amount)), { primary: true, blocked: blockedBy(v, m.sqkBalance) }),
    ),
    h(
      "div",
      { class: "stake-form" },
      h("h3", null, ctr(v, "stake.unstake")),
      unstakeForm.field,
      h("p", { class: "muted small" }, ctr(v, "stake.inStake", { n: formatAmount(m.staked, 2) })),
      chainButton(v, ctr(v, "stake.unstake"), () => submitAmount(v, unstakeForm.read(), m.staked, (amount) => c.unstake(amount)), { blocked: blockedBy(v, m.staked) }),
    ),
  );
  const claim = h(
    "div",
    { class: "claim-row" },
    chainButton(v, ctr(v, "stake.claim"), () => c.claim(), { primary: true, blocked: blockedBy(v, claimable > 0n || m.pendingWork > 0 ? 1n : 0n) }),
    hint(ctr(v, "stake.withdrawNote"), "hint small"),
  );
  return card(
    "stake-main",
    ctr(v, "stake.title"),
    hint(ctr(v, "stake.lead")),
    chainNotice(v),
    head,
    ...notes,
    busyLine(v, ["stake", "unstake", "claim", "sync"]),
    claim,
    forms,
    hint(ctr(v, "stake.payNote"), "hint small"),
  );
}

/** Why a button that spends `have` can't be pressed: nothing to spend, or another transaction. */
function blockedBy(v: View, have: bigint): string | null {
  if (v.chain?.s.busy) return ctr(v, "err.busy");
  return have > 0n ? null : ctr(v, "err.ZeroAmount");
}

function faucet(v: View, c: ChainView): HTMLElement {
  const f = c.s.faucet;
  const parts: (HTMLElement | null)[] = [];
  if (!f) parts.push(hint(ctr(v, "faucet.none")));
  else {
    const amount = formatAmount(f.amount, 0);
    const limit = formatAmount(f.limit, 0);
    parts.push(hint(ctr(v, "faucet.lead", { amount, limit })));
    const wait = f.nextAt * 1000 - c.now;
    const blocked =
      f.held >= f.limit ? ctr(v, "faucet.full", { limit }) : f.left < f.amount ? ctr(v, "faucet.empty") : wait > 0 ? ctr(v, "faucet.next", { time: duration(v.lang, wait) }) : null;
    parts.push(
      h("div", { class: "faucet-row" }, chainButton(v, ctr(v, "faucet.get", { amount }), () => c.drip(), { primary: !blocked, blocked: blocked ?? undefined }), blocked ? h("span", { class: "muted small" }, blocked) : null),
      busyLine(v, ["drip"]),
    );
  }
  parts.push(gasNote(v, c));
  return card("stake-faucet", ctr(v, "faucet.title"), ...parts);
}

const GAS_LOW = 2n * 10n ** 15n; // 0.002 ETH, a few transactions

/** A pointer to free Sepolia ETH when the wallet can't pay for gas. */
export function gasNote(v: View, c: ChainView): HTMLElement | null {
  if (c.s.gas === null || c.s.gas >= GAS_LOW) return null;
  const link = h("a", { href: "https://cloud.google.com/application/web3/faucet/ethereum/sepolia", target: "_blank", rel: "noopener noreferrer", class: "ext" }, `${ctr(v, "wallet.gasFaucet")} ↗`);
  link.addEventListener("click", (event) => {
    event.preventDefault();
    v.openUrl(link.href);
  });
  return h("p", { class: "hint warn gas-note" }, ctr(v, "wallet.gasLow"), " ", link);
}

function everyone(v: View, c: ChainView): HTMLElement {
  const m = c.s.minter!;
  const cfg = c.s.config;
  return card(
    "stake-all",
    ctr(v, "stake.everyone"),
    h(
      "div",
      { class: "stats" },
      stat(ctr(v, "stake.totalStaked"), tokenAmount("SQK", m.totalStaked, 0)),
      stat(ctr(v, "stake.mined"), tokenAmount("SQB", m.totalScheduled, 1)),
      stat(ctr(v, "stake.claimed"), tokenAmount("SQB", m.totalClaimed, 1)),
    ),
    hint(ctr(v, "stake.counted", { round: num(v.lang, m.lastRound), work: num(v.lang, m.lastWork) }), "hint small"),
    h(
      "p",
      { class: "contracts small" },
      h("span", { class: "label" }, ctr(v, "stake.contracts")),
      " SQB ",
      addressLink(v, cfg.sqb),
      " · SqbMinter ",
      addressLink(v, cfg.minter),
      " · SQK ",
      addressLink(v, cfg.sqk),
    ),
  );
}
