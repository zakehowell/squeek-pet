import { CONSUMABLES, FORK_NODE, GEAR, ITEMS, NODES, NPCS, ROUTE_ORDER, ROUTES, areaSpec, nodeSteps, type Hazard } from "../data";
import { gearSlots } from "../engine";
import { num } from "../i18n";
import { itemIcon, MARKS, npcPortrait } from "../art/icons";
import { PAW, areaArt, chestArt } from "../art/world-art";
import type { AreaId, Expedition, GearId, NpcId, RouteId } from "../types";
import { art, h } from "./dom";
import { bar, card, choiceButton, hint, rewardChips, tr, type View } from "./parts";

// Plan B, adventure: the trip under way, or planning the next one, and the
// friends met on the road.

export function adventureView(v: View): HTMLElement[] {
  return [v.world.expedition ? trail(v, v.world.expedition) : planner(v), friends(v)];
}

const hazardKey: Record<Hazard, "adv.hazard.dark" | "adv.hazard.cliff"> = { dark: "adv.hazard.dark", cliff: "adv.hazard.cliff" };

function hazardsOf(route: RouteId): Hazard[] {
  const found = new Set<Hazard>();
  for (const { event } of ROUTES[route].events) if (event.kind === "hazard") found.add(event.hazard);
  return [...found];
}

function trail(v: View, trip: Expedition): HTMLElement {
  const route = ROUTES[trip.route];
  const stops = h("ol", { class: "stops" });
  for (let node = 0; node < NODES; node++) {
    const reached = trip.node > node;
    const last = node === NODES - 1;
    const stop = h(
      "li",
      { class: [reached ? "reached" : "", trip.node === node ? "next" : "", last ? "treasure" : ""].filter(Boolean).join(" ") },
      art(last ? chestArt("gold", reached, "stop-chest") : PAW, "stop-mark"),
      h("span", null, last ? tr(v, "adv.treasure") : tr(v, "adv.stop", { n: node + 1 })),
      h("small", null, num(v.lang, nodeSteps(route.length, node))),
    );
    stop.style.left = `${((node + 1) / NODES) * 100}%`;
    stops.append(stop);
  }
  const fork =
    trip.node <= FORK_NODE && !trip.fork
      ? h(
          "div",
          { class: "fork" },
          h("strong", null, tr(v, "adv.forkTitle")),
          h(
            "div",
            { class: "fork-paths" },
            h("div", { class: "path" }, choiceButton(v, tr(v, "adv.safe"), { t: "fork", path: "safe" }, { small: true }), h("span", null, tr(v, "adv.safeNote"))),
            h("div", { class: "path" }, choiceButton(v, tr(v, "adv.risky"), { t: "fork", path: "risky" }, { small: true }), h("span", null, tr(v, "adv.riskyNote"))),
          ),
        )
      : trip.fork
        ? h("p", { class: "fork-chosen" }, tr(v, "adv.forkChosen", { path: tr(v, trip.fork === "safe" ? "adv.safe" : "adv.risky") }))
        : null;
  const found = Object.values(trip.found).some((n) => (n ?? 0) > 0) ? rewardChips(v.lang, trip.found) : h("span", { class: "muted" }, tr(v, "adv.nothingYet"));
  const carrying = [...trip.gear.map((g) => itemChip(v, g)), trip.snack ? itemChip(v, "snack") : null, trip.charm ? itemChip(v, "charm") : null].filter(Boolean) as HTMLElement[];
  return card(
    "adv-trail",
    tr(v, "adv.current"),
    h("div", { class: "trail-banner" }, banner(route.area), h("div", { class: "trail-title" }, h("strong", null, route.name[v.lang]), h("span", null, route.blurb[v.lang]))),
    h("div", { class: "trail-progress" }, bar(trip.steps / route.length, "trail-bar"), stops),
    h("p", { class: "trail-steps" }, tr(v, "adv.progress", { steps: num(v.lang, Math.min(trip.steps, route.length)), length: num(v.lang, route.length) })),
    fork,
    h("div", { class: "trail-row" }, h("span", { class: "label" }, tr(v, "adv.found")), found),
    h("div", { class: "trail-row" }, h("span", { class: "label" }, tr(v, "adv.carrying")), carrying.length ? h("span", { class: "cost" }, ...carrying) : h("span", { class: "muted" }, tr(v, "adv.none"))),
    h("div", { class: "trail-foot" }, hint(tr(v, "adv.how")), choiceButton(v, tr(v, "adv.recall"), { t: "recall" }, { small: true, confirm: tr(v, "adv.recallConfirm") })),
  );
}

/** The route's area as a wide banner: the drawing fills the width and is cropped top and bottom. */
function banner(area: AreaId): HTMLElement {
  const pic = art(areaArt(area), "trail-pic");
  pic.querySelector("svg")?.setAttribute("preserveAspectRatio", "xMidYMid slice");
  return pic;
}

function itemChip(v: View, id: GearId | "snack" | "charm"): HTMLElement {
  return h("span", { class: "chip", title: ITEMS[id].name[v.lang] }, art(itemIcon(id), "chip-ico"), h("span", { class: "chip-n" }, ITEMS[id].name[v.lang]));
}

function planner(v: View): HTMLElement {
  const open = ROUTE_ORDER.filter((id) => v.world.areas.includes(ROUTES[id].area));
  if (!v.ui.route || !open.includes(v.ui.route)) v.ui.route = open[0] ?? null;
  const ownedGear = GEAR.filter((g) => v.world.items[g] > 0);
  v.ui.gear = v.ui.gear.filter((g) => ownedGear.includes(g)).slice(0, gearSlots(v.world));
  if (v.world.items.snack < 1) v.ui.snack = false;
  if (v.world.items.charm < 1) v.ui.charm = false;

  const routes = ROUTE_ORDER.map((id) => {
    const route = ROUTES[id];
    const unlocked = open.includes(id);
    const hazards = hazardsOf(id);
    const done = v.world.routesDone[id] ?? 0;
    const pick = () => {
      v.ui.route = id;
      v.redraw();
    };
    const body = h(
      "div",
      { class: "route-text" },
      h("strong", null, route.name[v.lang]),
      h("span", { class: "route-meta" }, `${tr(v, "adv.steps", { n: route.length })} · ${areaSpec(route.area).name[v.lang]}${done ? ` · ${tr(v, "adv.done", { n: done })}` : ""}`),
      h("span", null, route.blurb[v.lang]),
      hazards.length ? h("span", { class: "route-hazards" }, `${tr(v, "adv.hazards")}: ${hazards.map((x) => tr(v, hazardKey[x])).join(v.lang === "zh" ? "、" : ", ")}`) : null,
      h("span", { class: "route-reward" }, art(chestArt("gold", false, "mini-chest"), "mark"), rewardChips(v.lang, route.reward)),
    );
    if (!unlocked) {
      return h("li", { class: "route locked" }, art(areaArt(route.area), "route-pic"), body, h("p", { class: "why" }, art(MARKS.lock, "mark"), tr(v, "adv.needArea", { area: areaSpec(route.area).name[v.lang] })));
    }
    const button = h("button", { type: "button", class: v.ui.route === id ? "route on" : "route", "aria-pressed": String(v.ui.route === id) }, art(areaArt(route.area), "route-pic"), body);
    button.addEventListener("click", pick);
    return h("li", null, button);
  });

  const slots = gearSlots(v.world);
  const gear = ownedGear.length
    ? h(
        "div",
        { class: "toggles" },
        ...ownedGear.map((g) => {
          const on = v.ui.gear.includes(g);
          const full = !on && v.ui.gear.length >= slots;
          const button = h("button", { type: "button", class: on ? "toggle on" : "toggle", "aria-pressed": String(on), disabled: full, title: ITEMS[g].effect[v.lang] }, art(itemIcon(g), "toggle-ico"), ITEMS[g].name[v.lang]);
          button.addEventListener("click", () => {
            v.ui.gear = on ? v.ui.gear.filter((x) => x !== g) : [...v.ui.gear, g];
            v.redraw();
          });
          return button;
        }),
      )
    : hint(tr(v, "adv.noGear"));
  const supplies = CONSUMABLES.filter((c) => v.world.items[c] > 0).map((c) => {
    const on = c === "snack" ? v.ui.snack : v.ui.charm;
    const button = h("button", { type: "button", class: on ? "toggle on" : "toggle", "aria-pressed": String(on), title: ITEMS[c].effect[v.lang] }, art(itemIcon(c), "toggle-ico"), `${ITEMS[c].name[v.lang]} ×${num(v.lang, v.world.items[c])}`);
    button.addEventListener("click", () => {
      if (c === "snack") v.ui.snack = !v.ui.snack;
      else v.ui.charm = !v.ui.charm;
      v.redraw();
    });
    return button;
  });

  const depart = v.ui.route
    ? choiceButton(v, tr(v, "adv.depart"), { t: "expedition", route: v.ui.route, gear: [...v.ui.gear], snack: v.ui.snack, charm: v.ui.charm }, { primary: true })
    : null;
  return card(
    "adv-plan",
    tr(v, "adv.plan"),
    h("ul", { class: "routes" }, ...routes),
    h("div", { class: "kit" }, h("h3", null, tr(v, "adv.gear", { n: slots })), gear, supplies.length ? h("h3", null, tr(v, "adv.extras")) : null, supplies.length ? h("div", { class: "toggles" }, ...supplies) : null),
    h("div", { class: "plan-foot" }, hint(tr(v, "adv.how")), depart),
  );
}

function friends(v: View): HTMLElement {
  const ids = Object.keys(NPCS) as NpcId[];
  return card(
    "adv-friends",
    tr(v, "adv.people"),
    h(
      "ul",
      { class: "friends" },
      ...ids.map((id) => {
        const met = v.world.stats.npcs[id] ?? 0;
        return h("li", { class: met ? "friend" : "friend unmet" }, art(npcPortrait(id), "friend-pic"), h("strong", null, NPCS[id].name[v.lang]), h("span", null, met ? tr(v, "adv.metTimes", { n: met }) : tr(v, "adv.notMet")));
      }),
    ),
  );
}
