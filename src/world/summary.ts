import type { Language } from "../core/i18n";
import { PLANTS, ROUTES } from "./data";
import { chestTier, currentSeason } from "./engine";
import { renderLine, ui } from "./i18n";
import type { WorldState } from "./types";

// What the pet says about the world: a short line for its hover bubble, and
// the news a pull brought, for its toasts. Pure, so both read the same way in
// the pet window, the World window and the tests.

/** The news settled by the given turns, rendered, oldest first. */
export function newsOf(world: WorldState, turnIds: Iterable<string>, lang: Language): string[] {
  const ids = new Set(turnIds);
  return world.news
    .filter((item) => ids.has(item.turn))
    .map((item) =>
      item.lines
        .map((line) => renderLine(lang, line))
        .filter(Boolean)
        .join(" "),
    )
    .filter(Boolean);
}

/** One toast for a pull's news: the newest line, and how many more wait in the log. */
export function newsToast(texts: readonly string[], lang: Language): string | null {
  if (!texts.length) return null;
  const newest = texts[texts.length - 1];
  return texts.length > 1 ? `${newest} ${ui(lang, "pet.more", { n: texts.length - 1 })}` : newest;
}

/** Past seasons whose chest is earned and still closed. */
export function closedChests(world: WorldState): number[] {
  const season = currentSeason(world);
  return Object.entries(world.guild.contribution)
    .map(([key, value]) => [Number(key), value] as const)
    .filter(([s, value]) => s < season && !world.guild.chests.includes(s) && chestTier(value, false) !== null)
    .map(([s]) => s);
}

/** The pet's bubble line: what is ready or under way, else the beans in the bag. */
export function worldSummary(world: WorldState, lang: Language): string {
  const parts: string[] = [];
  const ripe = world.plots.filter((plot) => plot.plant && plot.growth >= PLANTS[plot.plant].need).length;
  if (ripe) parts.push(ui(lang, "pet.ripe", { n: ripe }));
  const trip = world.expedition;
  if (trip) parts.push(ui(lang, "pet.trail", { pct: Math.min(99, Math.floor((trip.steps / ROUTES[trip.route].length) * 100)) }));
  if (closedChests(world).length) parts.push(ui(lang, "pet.chest"));
  if (!parts.length) parts.push(ui(lang, "pet.beans", { n: world.res.beans }));
  return parts.join(lang === "zh" ? "，" : " · ");
}
