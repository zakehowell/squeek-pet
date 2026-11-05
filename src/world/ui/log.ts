import { txUrl } from "../../pet/present";
import { renderLine } from "../i18n";
import { MARKS } from "../art/icons";
import type { DiaryEntry, DiaryKind } from "../types";
import { art, h } from "./dom";
import { card, hint, plainButton, tr, type View } from "./parts";

// The log: what every settled turn gave, newest first. Each real turn links
// to its settlement transaction on Sepolia.

const PAGE = 40;

const markOf: Record<DiaryKind, string> = {
  active: MARKS.sun,
  rest: MARKS.moon,
  gap: MARKS.lock,
  start: MARKS.block,
  event: MARKS.check,
};

const locales = { en: "en-US", zh: "zh-CN" } as const;

export function logView(v: View): HTMLElement[] {
  const entries = [...v.world.diary].reverse();
  if (!entries.length) return [card("log", tr(v, "tab.log"), hint(tr(v, "log.empty")))];
  const when = new Intl.DateTimeFormat(locales[v.lang], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  const shown = Math.max(PAGE, v.ui.logShown);
  const list = h("ol", { class: "diary" }, ...entries.slice(0, shown).map((entry) => row(v, entry, when)));
  const more =
    entries.length > shown
      ? plainButton(tr(v, "log.more", { n: entries.length - shown }), () => {
          v.ui.logShown = shown + PAGE * 2;
          v.redraw();
        }, "btn small ghost more")
      : null;
  return [card("log", tr(v, "tab.log"), hint(tr(v, "log.note")), list, more)];
}

function row(v: View, entry: DiaryEntry, when: Intl.DateTimeFormat): HTMLElement {
  const rounds =
    entry.kind === "event" || entry.kind === "start"
      ? null
      : entry.from === entry.to
        ? tr(v, "log.round", { n: String(entry.to) })
        : tr(v, "log.rounds", { from: String(entry.from), to: String(entry.to) });
  const tx = entry.tx && !entry.sim ? h("a", { class: "tx", href: txUrl(entry.tx), target: "_blank", rel: "noopener" }, tr(v, "log.tx")) : null;
  tx?.addEventListener("click", (event) => {
    event.preventDefault();
    v.openUrl(txUrl(entry.tx!));
  });
  return h(
    "li",
    { class: `entry ${entry.kind}` },
    art(markOf[entry.kind], "entry-mark"),
    h(
      "div",
      { class: "entry-body" },
      h(
        "div",
        { class: "entry-head" },
        h("time", { datetime: new Date(entry.at).toISOString() }, when.format(entry.at)),
        rounds ? h("span", { class: "rounds" }, rounds) : null,
        entry.sim ? h("span", { class: "tag trial" }, tr(v, "log.trial")) : null,
      ),
      ...entry.lines.map((line) => renderLine(v.lang, line)).filter(Boolean).map((text) => h("p", null, text)),
      tx,
    ),
  );
}
