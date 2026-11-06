import { DECORATIONS, decorationArt, plotArt } from "../art/chain-art";
import { formatAmount } from "../chain/amount";
import { shortAddress } from "../chain/config";
import type { Deed } from "../chain/game";
import { check } from "../engine";
import { errorText } from "../i18n";
import { bossOf } from "../season";
import { art, h } from "./dom";
import { addressLink, busyLine, chainButton, chainNotice, ctr, displayName, nameProblem, tokenAmount, type ChainView } from "./chain-parts";
import { card, hint, type View } from "./parts";

// The Town tab: the shared map of home deeds on Sepolia, the player's own
// deeds (name, renovate, add the bed to the world) and this season's
// decorations.

export function townView(v: View): HTMLElement[] {
  const c = v.chain!;
  if (!c.s.overview || !c.s.prices || !c.s.deeds) return [card("town-map", ctr(v, "town.map"), hint(c.s.readFailed ? ctr(v, "wallet.readFailed") : ctr(v, "wallet.reading")))];
  return [map(v, c), mine(v, c), decorations(v, c)];
}

const isMine = (c: ChainView, deed: Deed | undefined) => !!deed && deed.owner.toLowerCase() === c.s.account;

function map(v: View, c: ChainView): HTMLElement {
  const o = c.s.overview!;
  const p = c.s.prices!;
  const deeds = new Map(c.s.deeds!.map((d) => [d.id, d]));
  const soldOut = o.deedsSold >= p.deedCap;
  const buy = soldOut
    ? hint(ctr(v, "town.soldOut"))
    : h(
        "div",
        { class: "buy-row" },
        art(plotArt(1), "plot-pic"),
        h("div", { class: "buy-text" }, h("strong", null, ctr(v, "town.next", { n: o.deedsSold + 1 })), tokenAmount("SQK", o.nextDeedPrice, 0), h("span", { class: "muted small" }, ctr(v, "town.priceNote"))),
        chainButton(v, ctr(v, "town.buy"), () => c.buyDeed(o.nextDeedPrice), {
          primary: true,
          blocked: c.s.busy ? ctr(v, "err.busy") : o.sqkBalance < o.nextDeedPrice ? ctr(v, "err.ERC20InsufficientBalance") : null,
        }),
      );

  const tiles = Array.from({ length: p.deedCap }, (_, i) => {
    const id = i + 1;
    const deed = deeds.get(id);
    const mineToo = isMine(c, deed);
    const label = deed
      ? [ctr(v, "town.plot", { n: id }), displayName(deed.name) || ctr(v, "town.unnamed"), ctr(v, "town.level", { n: deed.level }), mineToo ? ctr(v, "town.yours") : ctr(v, "town.owner", { addr: shortAddress(deed.owner) })].join(" · ")
      : `${ctr(v, "town.plot", { n: id })} · ${ctr(v, "town.forSale")}`;
    const tile = h(
      "button",
      {
        type: "button",
        class: ["tile", deed ? "sold" : "free", mineToo ? "mine" : "", v.ui.plot === id ? "on" : ""].filter(Boolean).join(" "),
        title: label,
        "aria-label": label,
        "aria-pressed": String(v.ui.plot === id),
      },
      art(plotArt(deed?.level ?? 0, mineToo), "tile-pic"),
      h("span", { class: "tile-n", "aria-hidden": "true" }, String(id)),
    );
    tile.addEventListener("click", () => {
      v.ui.plot = v.ui.plot === id ? null : id;
      v.redraw();
    });
    return tile;
  });

  const picked = v.ui.plot !== null ? deeds.get(v.ui.plot) : undefined;
  const detail =
    v.ui.plot === null
      ? null
      : h(
          "div",
          { class: "plot-detail", role: "status" },
          h("strong", null, ctr(v, "town.plot", { n: v.ui.plot })),
          picked
            ? h(
                "span",
                null,
                `${displayName(picked.name) || ctr(v, "town.unnamed")} · ${ctr(v, "town.level", { n: picked.level })} · `,
                isMine(c, picked) ? ctr(v, "town.yours") : addressLink(v, picked.owner, ctr(v, "town.owner", { addr: shortAddress(picked.owner) })),
              )
            : h("span", null, ctr(v, "town.forSale")),
        );

  return card(
    "town-map",
    ctr(v, "town.map"),
    hint(ctr(v, "town.lead", { cap: p.deedCap })),
    chainNotice(v),
    h("p", { class: "sold-count" }, ctr(v, "town.sold", { n: o.deedsSold, cap: p.deedCap })),
    buy,
    busyLine(v, ["buyDeed"]),
    h("div", { class: "town-grid" }, ...tiles),
    detail,
    hint(ctr(v, "town.legend"), "hint small"),
  );
}

function mine(v: View, c: ChainView): HTMLElement {
  const p = c.s.prices!;
  const owned = c.s.deeds!.filter((d) => isMine(c, d));
  if (!owned.length) return card("town-mine", ctr(v, "town.mine"), hint(ctr(v, "town.none")));
  const rows = owned.map((deed) => {
    const key = `deed-name-${deed.id}`;
    const input = h("input", { type: "text", class: "name-input", maxlength: 32, "aria-label": ctr(v, "town.name"), placeholder: ctr(v, "town.namePlaceholder"), name: key });
    input.value = v.ui.form[key] ?? deed.name;
    input.addEventListener("input", () => {
      v.ui.form[key] = input.value;
    });
    const nextPrice = deed.level === 1 ? p.renovateLevel2Price : p.renovateLevel3Price;
    const renovate =
      deed.level >= 3
        ? h("p", { class: "maxed small" }, ctr(v, "town.maxed"))
        : h(
            "div",
            { class: "renovate" },
            chainButton(v, ctr(v, "town.renovate", { n: deed.level + 1 }), () => c.renovate(deed.id, deed.level + 1, nextPrice), {
              small: true,
              blocked: c.s.busy ? ctr(v, "err.busy") : (c.s.overview?.sqbBalance ?? 0n) < nextPrice ? ctr(v, "err.ERC20InsufficientBalance") : null,
            }),
            h("span", { class: "muted small" }, ctr(v, "town.renovateNote", { price: formatAmount(nextPrice, 0) })),
          );
    const placed = v.world.deed;
    const bedWhy = check(v.world, { t: "deed", deed: deed.id });
    const bed =
      placed === deed.id
        ? h("p", { class: "maxed small" }, ctr(v, "town.bedHere"))
        : placed
          ? h("p", { class: "muted small" }, ctr(v, "town.bedOther", { n: placed }))
          : h("div", { class: "bed-add" }, chainButton(v, ctr(v, "town.bed"), () => c.placeDeed(deed.id), { small: true, primary: true, blocked: bedWhy ? errorText(v.lang, bedWhy) : null }), h("span", { class: "muted small" }, ctr(v, "town.bedNote")));
    return h(
      "li",
      { class: "my-deed" },
      art(plotArt(deed.level, true), "plot-pic big"),
      h(
        "div",
        { class: "my-deed-body" },
        h("strong", null, `${ctr(v, "town.plot", { n: deed.id })} · ${ctr(v, "town.level", { n: deed.level })}`),
        h(
          "div",
          { class: "name-row" },
          input,
          chainButton(
            v,
            ctr(v, "town.saveName"),
            () => {
              // An empty name takes the sign down.
              const name = input.value.trim();
              const problem = name ? nameProblem(name) : null;
              if (problem) v.toast(ctr(v, problem), "warn");
              else c.nameDeed(deed.id, name);
            },
            { small: true },
          ),
        ),
        renovate,
        bed,
      ),
    );
  });
  return card("town-mine", ctr(v, "town.mine"), busyLine(v, ["nameDeed", "renovate"]), h("ul", { class: "my-deeds" }, ...rows));
}

function decorations(v: View, c: ChainView): HTMLElement {
  const o = c.s.overview!;
  const p = c.s.prices!;
  const season = o.season;
  const boss = bossOf(Math.max(1, season));
  const bossName = boss.name[v.lang];
  const items = DECORATIONS.map((kind, index) => {
    const owned = (o.decorationsThisSeason & (1 << index)) !== 0;
    const name = ctr(v, `deco.${kind}`, { boss: bossName });
    return h(
      "li",
      { class: owned ? "deco owned" : "deco" },
      art(decorationArt(kind, boss.id), "deco-pic"),
      h("strong", null, name),
      owned
        ? h("span", { class: "maxed small" }, ctr(v, "deco.owned"))
        : chainButton(v, `${ctr(v, "deco.buy")} · ${formatAmount(p.decorationPrice, 0)} SQB`, () => c.buyDecoration(index), {
            small: true,
            blocked: c.s.busy ? ctr(v, "err.busy") : season < 1 ? ctr(v, "err.SeasonNotStarted") : o.sqbBalance < p.decorationPrice ? ctr(v, "err.ERC20InsufficientBalance") : null,
          }),
    );
  });
  const collection: HTMLElement[] = [];
  (c.s.decorations ?? []).forEach((bits, i) => {
    const s = i + 1;
    const b = bossOf(s);
    DECORATIONS.forEach((kind, index) => {
      if (!(bits & (1 << index))) return;
      const name = ctr(v, `deco.${kind}`, { boss: b.name[v.lang] });
      collection.push(h("li", { class: "deco-mini", title: `${name} · ${ctr(v, "deco.season", { n: s })}` }, art(decorationArt(kind, b.id), "deco-pic small"), h("span", null, ctr(v, "deco.season", { n: s }))));
    });
  });
  return card(
    "town-deco",
    ctr(v, "deco.title", { n: Math.max(1, season) }),
    hint(ctr(v, "deco.lead", { price: formatAmount(p.decorationPrice, 0) })),
    busyLine(v, ["decoration"]),
    h("ul", { class: "decos" }, ...items),
    h("h3", null, ctr(v, "deco.collection")),
    collection.length ? h("ul", { class: "deco-collection" }, ...collection) : hint(ctr(v, "deco.empty")),
  );
}
