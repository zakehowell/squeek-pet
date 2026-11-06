import { AREAS, AREA_ORDER, BUILDINGS, BUILDING_ORDER, CONSUMABLES, GEAR, ITEMS, PLANTS, PLANT_ORDER, areaSpec } from "../data";
import { areaCost, check, craftCost, nextLevelCost } from "../engine";
import { errorText } from "../i18n";
import { itemIcon, MARKS, resIcon, seedIcon } from "../art/icons";
import { areaArt, buildingArt, plantArt, stageOf } from "../art/world-art";
import type { AreaId, ItemId, PlantId, Plot } from "../types";
import { ct } from "../i18n-chain";
import { art, h } from "./dom";
import { bar, card, choiceButton, costChips, hint, plainButton, rewardChips, tr, type View } from "./parts";

// Plan A, the home: garden beds, buildings, the map and the workshop.

export function homeView(v: View): HTMLElement[] {
  return [beds(v), buildings(v), areas(v), workshop(v)];
}

const growsKey = { work: "home.growsOn.work", rest: "home.growsOn.rest", both: "home.growsOn.both" } as const;

function seedCount(v: View, plant: PlantId): number {
  const from = PLANTS[plant].seedFrom;
  return from === "packet" ? v.world.seeds[plant] : v.world.res[from];
}

function beds(v: View): HTMLElement {
  const groups = AREA_ORDER.filter((area) => v.world.areas.includes(area)).map((area) => {
    const cards = v.world.plots.map((plot, index) => ({ plot, index })).filter(({ plot }) => plot.area === area).map(({ plot, index }) => bed(v, plot, index));
    return h("div", { class: "bed-group" }, h("h3", null, areaSpec(area).name[v.lang]), h("div", { class: "beds" }, ...cards));
  });
  const picker = v.ui.picking !== null && v.world.plots[v.ui.picking] && !v.world.plots[v.ui.picking].plant ? seedPicker(v, v.ui.picking) : null;
  return card("home-beds", tr(v, "home.beds"), ...groups, picker, deedHint(v));
}

/** A home deed on Sepolia whose bed isn't in the world yet. */
function deedHint(v: View): HTMLElement | null {
  if (!v.chain || v.world.deed || !(v.chain.s.overview?.deedsOwned ?? 0)) return null;
  const go = () => {
    v.ui.tab = "town";
    v.redraw();
  };
  return h("div", { class: "deed-hint" }, hint(ct(v.lang, "home.deedHint")), plainButton(ct(v.lang, "home.toTown"), go, "btn small primary"));
}

function bed(v: View, plot: Plot, index: number): HTMLElement {
  const label = plot.deed ? ct(v.lang, "home.deedBed", { n: plot.deed }) : tr(v, "home.bed", { n: index + 1 });
  if (!plot.plant) {
    const open = () => {
      v.ui.picking = v.ui.picking === index ? null : index;
      v.redraw();
    };
    return h(
      "div",
      { class: v.ui.picking === index ? "bed empty picking" : "bed empty" },
      art(plantArt(null, 0, plot.area === "lake"), "bed-pic"),
      h("div", { class: "bed-name" }, h("strong", null, tr(v, "home.empty")), h("span", null, label)),
      plainButton(tr(v, "home.plant"), open, "btn small"),
    );
  }
  const spec = PLANTS[plot.plant];
  const ripe = plot.growth >= spec.need;
  const pct = Math.floor((plot.growth * 100) / spec.need);
  const actions = h("div", { class: "bed-actions" });
  if (ripe) actions.append(choiceButton(v, tr(v, "home.harvest"), { t: "harvest", plot: index }, { primary: true, small: true }));
  else actions.append(choiceButton(v, tr(v, "home.clear"), { t: "clear", plot: index }, { small: true, confirm: tr(v, "home.clearConfirm", { plant: spec.name[v.lang] }) }));
  return h(
    "div",
    { class: ripe ? "bed ripe" : "bed" },
    art(plantArt(plot.plant, stageOf(plot.growth, spec.need), plot.area === "lake"), "bed-pic"),
    h("div", { class: "bed-name" }, h("strong", null, spec.name[v.lang]), h("span", null, label)),
    ripe ? h("p", { class: "ripe-note" }, art(MARKS.check, "mark"), tr(v, "home.ripe")) : h("div", { class: "bed-growth" }, bar(plot.growth / spec.need), h("span", null, tr(v, "home.growth", { pct }))),
    h("p", { class: "bed-hint" }, tr(v, growsKey[spec.grows])),
    actions,
  );
}

function seedPicker(v: View, index: number): HTMLElement {
  const plot = v.world.plots[index];
  const close = () => {
    v.ui.picking = null;
    v.redraw();
  };
  const options = PLANT_ORDER.map((id) => {
    const spec = PLANTS[id];
    const fits = !spec.area || spec.area === plot.area;
    const have = seedCount(v, id);
    const seeds = spec.seedFrom === "packet" ? tr(v, "home.seedPackets", { n: have }) : tr(v, "home.seedRes", { n: have });
    const button = choiceButton(v, tr(v, "home.plant"), { t: "plant", plot: index, plant: id }, { primary: true, small: true });
    return h(
      "li",
      { class: fits && have > 0 ? "seed" : "seed off" },
      art(spec.seedFrom === "packet" ? seedIcon(id) : resIcon(spec.seedFrom), "seed-ico"),
      h(
        "div",
        { class: "seed-text" },
        h("strong", null, spec.name[v.lang]),
        h("span", null, fits ? `${seeds} · ${tr(v, growsKey[spec.grows])}` : tr(v, "home.onlyIn", { area: areaSpec(spec.area!).name[v.lang] })),
        h("span", { class: "seed-yield" }, tr(v, "home.yields", { items: "" }), rewardChips(v.lang, spec.yields)),
      ),
      fits ? button : null,
    );
  });
  return h(
    "div",
    { class: "picker", role: "dialog", "aria-label": tr(v, "home.pick", { n: index + 1 }) },
    h("div", { class: "picker-head" }, h("strong", null, tr(v, "home.pick", { n: index + 1 })), plainButton(tr(v, "home.cancel"), close, "btn small ghost")),
    h("ul", { class: "seeds" }, ...options),
  );
}

function buildings(v: View): HTMLElement {
  const cards = BUILDING_ORDER.map((id) => {
    const spec = BUILDINGS[id];
    const level = v.world.buildings[id] ?? 0;
    const unlocked = v.world.areas.includes(spec.area);
    const cost = nextLevelCost(v.world, id);
    const foot = h("div", { class: "bld-foot" });
    if (!unlocked) {
      foot.append(h("p", { class: "why" }, art(MARKS.lock, "mark"), tr(v, "home.needsPrevious", { area: areaSpec(spec.area).name[v.lang] })));
    } else if (!cost) {
      foot.append(h("p", { class: "maxed" }, art(MARKS.check, "mark"), tr(v, "home.max")));
    } else {
      const choice = { t: "build", building: id } as const;
      foot.append(costChips(v, cost), choiceButton(v, tr(v, level ? "home.upgrade" : "home.build"), choice, { primary: true, small: true }));
      if (check(v.world, choice) === "err.cottage") foot.append(h("p", { class: "why" }, errorText(v.lang, "err.cottage")));
    }
    return h(
      "article",
      { class: level ? "bld-card" : "bld-card unbuilt" },
      art(buildingArt(id, level), "bld-pic"),
      h("div", { class: "bld-head" }, h("strong", null, spec.name[v.lang]), h("span", { class: "level" }, level ? tr(v, "home.level", { n: level }) : tr(v, "home.notBuilt"))),
      h("p", { class: "bld-effect" }, spec.effect[v.lang]),
      foot,
    );
  });
  return card("home-buildings", tr(v, "home.buildings"), h("div", { class: "bld-grid" }, ...cards));
}

function areas(v: View): HTMLElement {
  const cards = AREAS.map((spec, index) => {
    const unlocked = v.world.areas.includes(spec.id);
    const previous: AreaId | undefined = AREA_ORDER[index - 1];
    const foot = h("div", { class: "area-foot" });
    if (unlocked) foot.append(h("p", { class: "maxed" }, art(MARKS.check, "mark"), tr(v, "home.unlocked")));
    else if (previous && !v.world.areas.includes(previous)) foot.append(h("p", { class: "why" }, art(MARKS.lock, "mark"), tr(v, "home.needsPrevious", { area: areaSpec(previous).name[v.lang] })));
    else foot.append(costChips(v, areaCost(v.world, spec.id)), choiceButton(v, tr(v, "home.unlock"), { t: "unlock", area: spec.id }, { primary: true, small: true }));
    return h(
      "article",
      { class: unlocked ? "area-card" : "area-card locked" },
      art(areaArt(spec.id), "area-pic"),
      h("div", { class: "area-text" }, h("strong", null, spec.name[v.lang]), h("p", null, spec.blurb[v.lang]), foot),
    );
  });
  return card("home-areas", tr(v, "home.areas"), h("div", { class: "area-grid" }, ...cards));
}

function workshop(v: View): HTMLElement {
  const items: ItemId[] = [...GEAR, ...CONSUMABLES];
  const rows = items.map((id) => {
    const spec = ITEMS[id];
    const have = v.world.items[id];
    const status = !have ? "" : spec.consumable ? tr(v, "home.have", { n: have }) : tr(v, "home.owned");
    const needsWorkshop = spec.workshop && !v.world.buildings.workshop;
    return h(
      "li",
      { class: "craft" },
      art(itemIcon(id), "craft-ico"),
      h("div", { class: "craft-text" }, h("strong", null, spec.name[v.lang], status ? h("span", { class: "owned" }, status) : null), h("span", null, spec.effect[v.lang])),
      h(
        "div",
        { class: "craft-buy" },
        needsWorkshop ? h("p", { class: "why" }, art(MARKS.lock, "mark"), tr(v, "home.needsWorkshop")) : costChips(v, craftCost(v.world, id)),
        needsWorkshop || (!spec.consumable && have > 0) ? null : choiceButton(v, tr(v, "home.make"), { t: "craft", item: id }, { small: true }),
      ),
    );
  });
  return card("home-craft", tr(v, "home.craft"), h("ul", { class: "crafts" }, ...rows));
}
