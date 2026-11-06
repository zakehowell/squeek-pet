import type { BossId } from "../types";

// Pictures for the on-chain parts of the World: the two tokens, the plots on
// the town map and the season decorations. Same language as icons.ts and
// world-art.ts: soft fills, a light top edge, a darker outline in the same hue.
// Every drawing is our own static markup, so it is safe to insert as HTML.

const svg = (body: string, view: string, cls: string) =>
  `<svg class="${cls}" viewBox="${view}" aria-hidden="true" focusable="false">${body}</svg>`;

// ---- Tokens -------------------------------------------------------------------

/** SQK, Squeekchain's token: a gold coin with the hamster's wheel. */
export function sqkIcon(cls = "ico"): string {
  return svg(
    `<circle cx="12" cy="12.4" r="9.2" fill="#f5b04c" stroke="#a5520f" stroke-width="1.3"/>
     <circle cx="12" cy="12.4" r="6.6" fill="#ffd27a" stroke="#d47a1f" stroke-width="1.1"/>
     <circle cx="12" cy="12.4" r="3.6" fill="none" stroke="#a5520f" stroke-width="1.3"/>
     <path d="M12 8.8v7.2M8.4 12.4h7.2M9.5 9.9l5 5M14.5 9.9l-5 5" stroke="#a5520f" stroke-width=".9" stroke-linecap="round"/>
     <circle cx="12" cy="12.4" r="1.1" fill="#a5520f"/>
     <path d="M6.6 8.2c1.2-1.6 3.1-2.6 5.2-2.7" stroke="#fff5d6" stroke-width="1.3" stroke-linecap="round" fill="none"/>`,
    "0 0 24 24",
    cls,
  );
}

/** SQB, Squeek Pet World's token: a green coin with a data bean. */
export function sqbIcon(cls = "ico"): string {
  return svg(
    `<circle cx="12" cy="12.4" r="9.2" fill="#7fd39a" stroke="#2c7a4b" stroke-width="1.3"/>
     <circle cx="12" cy="12.4" r="6.6" fill="#b5ecc2" stroke="#4fae6f" stroke-width="1.1"/>
     <ellipse cx="12" cy="12.6" rx="4.2" ry="3.1" fill="url(#w-bean)" stroke="#1a8cc6" stroke-width="1"/>
     <ellipse cx="10.7" cy="11.6" rx="1.5" ry=".8" fill="#fff" opacity=".9"/>
     <path d="M6.6 8.2c1.2-1.6 3.1-2.6 5.2-2.7" stroke="#effff2" stroke-width="1.3" stroke-linecap="round" fill="none"/>`,
    "0 0 24 24",
    cls,
  );
}

/** The Town tab: a little house behind a fence. */
export function townIcon(cls = "ico"): string {
  return svg(
    `<path d="M5.4 11.6h13.2v8.8H5.4Z" fill="#fff1d9" stroke="#8a5a2e" stroke-width="1.2"/>
     <path d="M3.6 12.2 12 4.6l8.4 7.6Z" fill="#e0824a" stroke="#8a4a22" stroke-width="1.2" stroke-linejoin="round"/>
     <path d="M6.4 11.2 12 6.2" stroke="#ffd0a8" stroke-width="1.1" stroke-linecap="round"/>
     <rect x="10.4" y="14.6" width="3.2" height="5.8" rx=".6" fill="#9a6440" stroke="#6b4429" stroke-width=".9"/>
     <rect x="6.8" y="13.6" width="2.4" height="2.4" fill="#bfe6f7" stroke="#6b4429" stroke-width=".8"/>
     <rect x="14.8" y="13.6" width="2.4" height="2.4" fill="#bfe6f7" stroke="#6b4429" stroke-width=".8"/>
     <path d="M2.6 21.4h18.8" stroke="#5f9e4f" stroke-width="1.6" stroke-linecap="round"/>`,
    "0 0 24 24",
    cls,
  );
}

// ---- Plots on the town map ------------------------------------------------------

const GRASS = `<rect x="1" y="1" width="26" height="26" rx="3" fill="#a8d987" stroke="#5f9e4f" stroke-width="1.2"/>
  <path d="M4 5.5l1 1.6 1-1.6M21 22l1 1.6 1-1.6M22.5 5l.8 1.4.8-1.4" stroke="#5f9e4f" stroke-width=".9" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M3.2 4.4h6" stroke="#d6f0c2" stroke-width="1" stroke-linecap="round"/>`;

const SOIL = `<rect x="4.5" y="11" width="19" height="13" rx="2" fill="url(#w-soil)" stroke="#5c3b28" stroke-width="1.1"/>
  <path d="M7 15h14M7 18.5h14M7 22h14" stroke="#5c3b28" stroke-width=".9" opacity=".55"/>
  <path d="M8.5 14.4v-1.6M12.5 14.4v-1.8M16.5 14.4v-1.5M20 17.9v-1.6M10.5 17.9v-1.7" stroke="#5fae4c" stroke-width="1.2" stroke-linecap="round"/>`;

const FENCE = `<path d="M3.2 10v15M24.8 10v15M3.2 12.5h21.6M3.2 25h21.6" stroke="#b07d4f" stroke-width="1.1" stroke-linecap="round" fill="none"/>`;

const SIGN = `<path d="M22 4v7" stroke="#7d4f31" stroke-width="1.4" stroke-linecap="round"/>
  <rect x="18.5" y="3.5" width="7" height="4.4" rx=".9" fill="#f6ead2" stroke="#9c7a4c" stroke-width="1"/>`;

const SHED = `<path d="M4.6 10.4 9 6.4l4.4 4v1" fill="none"/>
  <path d="M5.2 10.2h7.6v5.4H5.2Z" fill="#fff1d9" stroke="#8a5a2e" stroke-width="1"/>
  <path d="M4 10.6 9 6.2l5 4.4Z" fill="#c8743a" stroke="#8a4a22" stroke-width="1" stroke-linejoin="round"/>
  <rect x="8" y="12.4" width="2" height="3.2" fill="#9a6440"/>`;

const COTTAGE = `<path d="M3.6 14.2h11v8.4h-11Z" fill="url(#wa-wall)" stroke="#8a5a2e" stroke-width="1.1"/>
  <path d="M2.4 14.6 9.1 7.6l6.7 7Z" fill="url(#wa-roof)" stroke="#8a4a22" stroke-width="1.1" stroke-linejoin="round"/>
  <rect x="7.8" y="17.4" width="2.8" height="5.2" rx=".6" fill="#9a6440" stroke="#6b4429" stroke-width=".8"/>
  <rect x="4.6" y="16" width="2.2" height="2.2" fill="#bfe6f7" stroke="#6b4429" stroke-width=".7"/>
  <rect x="11.6" y="16" width="2.2" height="2.2" fill="#bfe6f7" stroke="#6b4429" stroke-width=".7"/>
  <path d="M12.4 9.6v-3h1.8v4.8" fill="#b9aea3" stroke="#6b4429" stroke-width=".8"/>
  <circle cx="17.6" cy="21" r="1.4" fill="#ff8fb1"/><circle cx="20.4" cy="21.6" r="1.4" fill="#ffd25a"/><circle cx="23" cy="21" r="1.4" fill="#a898f0"/>
  <path d="M17.6 22.4v1.6M20.4 23v1.2M23 22.4v1.6" stroke="#5fae4c" stroke-width="1"/>`;

/** One plot: 0 for sale, 1 a fenced bed, 2 with a shed, 3 with a cottage. `mine` frames it in gold. */
export function plotArt(level: number, mine = false, cls = "plot-art"): string {
  const frame = mine ? `<rect x=".8" y=".8" width="26.4" height="26.4" rx="3.2" fill="none" stroke="#e2a92c" stroke-width="1.8"/>` : "";
  if (level <= 0) {
    return svg(
      `${GRASS}<path d="M14 9v12" stroke="#7d4f31" stroke-width="1.6" stroke-linecap="round"/>
       <rect x="8.6" y="7" width="10.8" height="6.4" rx="1.1" fill="#f6ead2" stroke="#9c7a4c" stroke-width="1.1"/>
       <circle cx="14" cy="10.2" r="1.9" fill="#f5b04c" stroke="#a5520f" stroke-width=".8"/>${frame}`,
      "0 0 28 28",
      cls,
    );
  }
  if (level === 1) return svg(`${GRASS}${FENCE}${SOIL}${SIGN}${frame}`, "0 0 28 28", cls);
  if (level === 2) {
    return svg(
      `${GRASS}${FENCE}<rect x="14.5" y="11" width="9" height="13" rx="2" fill="url(#w-soil)" stroke="#5c3b28" stroke-width="1.1"/>
       <path d="M16 15h6M16 18.5h6M16 22h6" stroke="#5c3b28" stroke-width=".9" opacity=".55"/>
       <path d="M17.4 14.4v-1.6M20.6 14.4v-1.8M18.8 17.9v-1.6" stroke="#5fae4c" stroke-width="1.2" stroke-linecap="round"/>
       <g transform="translate(0 5)">${SHED}</g>${SIGN}${frame}`,
      "0 0 28 28",
      cls,
    );
  }
  return svg(`${GRASS}${FENCE}${COTTAGE}${SIGN}${frame}`, "0 0 28 28", cls);
}

// ---- Season decorations -----------------------------------------------------------

export const DECORATIONS = ["lantern", "bunting", "planter", "statue"] as const;
export type DecorationId = (typeof DECORATIONS)[number];

const BOSS_TINT: Record<BossId, [string, string, string]> = {
  tangerine: ["#ffcf8a", "#f0a04b", "#a8601f"],
  clockcrow: ["#c3cddc", "#7d8ea8", "#3f4b5e"],
  fogserpent: ["#dfe6f6", "#a9b8d8", "#5e6f96"],
  frostowl: ["#e4f4fb", "#9ccbe0", "#4f86a3"],
};

/** A decoration of `kind` in the colors of the season's boss. */
export function decorationArt(kind: DecorationId, boss: BossId, cls = "deco-art"): string {
  const [light, mid, ink] = BOSS_TINT[boss];
  const shadow = `<ellipse cx="14" cy="25.4" rx="8" ry="1.6" fill="#000" opacity=".12"/>`;
  const bodies: Record<DecorationId, string> = {
    lantern: `${shadow}<path d="M14 25V12" stroke="#6b4a2f" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M10 25h8" stroke="#6b4a2f" stroke-width="1.6" stroke-linecap="round"/>
      <circle cx="14" cy="9.6" r="7" fill="url(#w-glow-warm)"/>
      <path d="M10.4 6.4h7.2l.9 7c0 .9-1.6 1.6-4.5 1.6s-4.5-.7-4.5-1.6Z" fill="${light}" stroke="${ink}" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M14 8.8c1 1.2 1.1 2.3.5 3.2-.4.6-.9.6-1.3.3-.7-.7-.3-2.2.8-3.5Z" fill="#ff9e3d"/>
      <rect x="9.6" y="4.8" width="8.8" height="2" rx=".9" fill="${mid}" stroke="${ink}" stroke-width=".9"/>`,
    bunting: `${shadow}<path d="M4 6v19M24 6v19" stroke="#8a5a2e" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M4 7.4c3.4 2.6 16.6 2.6 20 0" stroke="#6b4a2f" stroke-width=".9" fill="none"/>
      <path d="M6.2 8.6 8.4 14l2.2-4.9ZM11.4 9.4 14 15l2.6-5.6ZM17.4 9.1 19.6 14l2.2-5.4Z" fill="${mid}" stroke="${ink}" stroke-width=".9" stroke-linejoin="round"/>
      <path d="M8.6 9.2 9.6 11.4 10.6 9.3ZM14 10l1 2 1-2Z" fill="${light}"/>`,
    planter: `${shadow}<path d="M8 17h12l-1.4 7.4c-.1.6-.6 1-1.2 1h-7.2c-.6 0-1.1-.4-1.2-1Z" fill="${mid}" stroke="${ink}" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M7.2 15.6h13.6v2H7.2Z" fill="${light}" stroke="${ink}" stroke-width="1"/>
      <path d="M14 15.4V9M14 12c-2-.4-3.4-1.8-3.6-3.6 2 .2 3.4 1.6 3.6 3.6ZM14 11c2-.4 3.4-1.8 3.6-3.6-2 .2-3.4 1.6-3.6 3.6Z" fill="#6cc05a" stroke="#3f8c3a" stroke-width=".9" stroke-linejoin="round"/>
      <circle cx="14" cy="6.6" r="2.4" fill="#ffd25a" stroke="#e0a12a" stroke-width=".9"/><circle cx="14" cy="6.6" r=".9" fill="#a8601f"/>`,
    statue: `${shadow}<rect x="8" y="20" width="12" height="5" rx="1" fill="#e9e3f3" stroke="#8f857b" stroke-width="1.1"/>
      <path d="M9.6 20c-.4-4 1-8.4 4.4-9.6 3.4 1.2 4.8 5.6 4.4 9.6Z" fill="${mid}" stroke="${ink}" stroke-width="1.1" stroke-linejoin="round"/>
      <circle cx="14" cy="8.2" r="3.6" fill="${light}" stroke="${ink}" stroke-width="1.1"/>
      <path d="M11 6.2 10.6 3.6l2.2 1.6M17 6.2l.4-2.6-2.2 1.6" fill="${light}" stroke="${ink}" stroke-width=".9" stroke-linejoin="round"/>
      <circle cx="12.8" cy="8" r=".6" fill="${ink}"/><circle cx="15.2" cy="8" r=".6" fill="${ink}"/>`,
  };
  return svg(bodies[kind], "0 0 28 28", cls);
}
