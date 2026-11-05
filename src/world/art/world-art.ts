import type { AreaId, BossId, BuildingId, GuildId, PlantId } from "../types";

// Pictures for the World window: buildings, plants in their beds, the five
// areas, the weekly bosses and the guild crests. Same language as icons.ts:
// soft gradients, a light top edge and a darker outline in the same hue.
// Every drawing is our own static markup, so it is safe to insert as HTML.
// Gradients come from `worldDefs`, inserted once per page.

const svg = (body: string, view: string, cls: string) =>
  `<svg class="${cls}" viewBox="${view}" aria-hidden="true" focusable="false">${body}</svg>`;

export function worldDefs(): string {
  return `<svg class="art-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>
    <linearGradient id="wa-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfe9fb"/><stop offset="1" stop-color="#f4f9ef"/></linearGradient>
    <linearGradient id="wa-dusk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4b4383"/><stop offset=".65" stop-color="#8b78c9"/><stop offset="1" stop-color="#e3b7c6"/></linearGradient>
    <linearGradient id="wa-hill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fd27e"/><stop offset="1" stop-color="#6fae55"/></linearGradient>
    <linearGradient id="wa-hill2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b9de95"/><stop offset="1" stop-color="#8cc46c"/></linearGradient>
    <linearGradient id="wa-lake" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fd3ee"/><stop offset="1" stop-color="#4fa3cf"/></linearGradient>
    <linearGradient id="wa-roof" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0a95e"/><stop offset="1" stop-color="#c8743a"/></linearGradient>
    <linearGradient id="wa-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff4e2"/><stop offset="1" stop-color="#f0dcbc"/></linearGradient>
    <linearGradient id="wa-plank" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d39a68"/><stop offset="1" stop-color="#a86f45"/></linearGradient>
    <linearGradient id="wa-stone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e6e0d8"/><stop offset="1" stop-color="#bdb3a7"/></linearGradient>
    <linearGradient id="wa-silo" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e9f6fc"/><stop offset=".55" stop-color="#cfe8f4"/><stop offset="1" stop-color="#a9cfe2"/></linearGradient>
    <linearGradient id="wa-dome" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d8d2f6"/><stop offset="1" stop-color="#8f84d8"/></linearGradient>
    <linearGradient id="wa-soil" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a77654"/><stop offset="1" stop-color="#77503a"/></linearGradient>
    <linearGradient id="wa-leaf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fd06f"/><stop offset="1" stop-color="#4f9a45"/></linearGradient>
    <radialGradient id="wa-glow"><stop offset="0" stop-color="#fff4c2" stop-opacity=".95"/><stop offset=".5" stop-color="#ffd36b" stop-opacity=".4"/><stop offset="1" stop-color="#ffd36b" stop-opacity="0"/></radialGradient>
    <radialGradient id="wa-moon"><stop offset="0" stop-color="#f6f1ff" stop-opacity=".95"/><stop offset=".55" stop-color="#cbbcff" stop-opacity=".35"/><stop offset="1" stop-color="#cbbcff" stop-opacity="0"/></radialGradient>
    <radialGradient id="wa-shadow"><stop offset="0" stop-color="#3a2b25" stop-opacity=".22"/><stop offset="1" stop-color="#3a2b25" stop-opacity="0"/></radialGradient>
    <radialGradient id="wa-cat" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#ffc27a"/><stop offset="1" stop-color="#e88a34"/></radialGradient>
    <radialGradient id="wa-fog" cx=".5" cy=".5" r=".6"><stop offset="0" stop-color="#eef3fb"/><stop offset="1" stop-color="#c3cfe6"/></radialGradient>
    <radialGradient id="wa-frost" cx=".4" cy=".3" r=".9"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#bcdcec"/></radialGradient>
  </defs></svg>`;
}

const shadow = (cx: number, cy: number, rx: number) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${rx * 0.22}" fill="url(#wa-shadow)"/>`;

// ---- Buildings ---------------------------------------------------------------

/** One building as it looks at `level` (0 = a dashed outline of the plot). */
const BUILDING: Record<BuildingId, (level: number) => string> = {
  cottage: (level) => `${shadow(32, 56, 26)}
    <path d="M12 30h40v20a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4Z" fill="url(#wa-wall)" stroke="#a8794e" stroke-width="1.4"/>
    <path d="M6.5 32C9 18 19 9 32 9s23 9 25.5 23c.3 1.6-1 2.6-2.4 2.2C47 31.8 40 31 32 31s-15 .8-23.1 3.2c-1.4.4-2.7-.6-2.4-2.2Z" fill="url(#wa-roof)" stroke="#9c5826" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M14 22c5-3.6 11-5.4 18-5.4S45 18.4 50 22M10.6 28c6.4-3 13.6-4.4 21.4-4.4S47 25 53.4 28" stroke="#ffd29a" stroke-width="1.3" stroke-linecap="round" fill="none" opacity=".75"/>
    <rect x="42" y="8" width="6" height="10" rx="1.4" fill="#c9b8a4" stroke="#8a7562" stroke-width="1.2"/>
    <path d="M27 54V44a5 5 0 0 1 10 0v10Z" fill="#9a6440" stroke="#6e4329" stroke-width="1.3"/>
    <circle cx="34.6" cy="49" r=".9" fill="#f3d28c"/>
    <circle cx="19.5" cy="41" r="4.2" fill="#ffe7a3" stroke="#a8794e" stroke-width="1.3"/>
    <path d="M19.5 36.8v8.4M15.3 41h8.4" stroke="#a8794e" stroke-width="1"/>
    ${level >= 2 ? `<circle cx="44.5" cy="41" r="4.2" fill="#ffe7a3" stroke="#a8794e" stroke-width="1.3"/><path d="M44.5 36.8v8.4M40.3 41h8.4" stroke="#a8794e" stroke-width="1"/>
      <rect x="14" y="45.6" width="11" height="3" rx="1.2" fill="#b77a45" stroke="#7d4f31" stroke-width=".9"/><circle cx="16.6" cy="45" r="1.5" fill="#f28aa0"/><circle cx="19.6" cy="44.6" r="1.5" fill="#ffd25a"/><circle cx="22.6" cy="45" r="1.5" fill="#f28aa0"/>` : ""}
    ${level >= 3 ? `<path d="M32 9V2.5" stroke="#7d4f31" stroke-width="1.3" stroke-linecap="round"/><path d="M32 2.6l7 2.4-7 2.4Z" fill="#7563dd" stroke="#5b49c4" stroke-width=".9" stroke-linejoin="round"/>` : ""}`,
  lantern: (level) => {
    const lamp = (x: number, h: number) => `<path d="M${x} 54V${54 - h}" stroke="#7d4f31" stroke-width="2" stroke-linecap="round"/>
      <path d="M${x} ${54 - h}h6" stroke="#7d4f31" stroke-width="1.6" stroke-linecap="round"/>
      <circle cx="${x + 6}" cy="${54 - h + 7}" r="9" fill="url(#wa-glow)"/>
      <rect x="${x + 2.6}" y="${54 - h + 2.6}" width="6.8" height="8.6" rx="3" fill="#ffd36b" stroke="#c9861a" stroke-width="1.1"/>
      <path d="M${x + 4.2} ${54 - h + 4.6}c.8 1.4.8 2.8 0 4.2" stroke="#fff6cf" stroke-width="1" stroke-linecap="round" fill="none"/>`;
    const lamps = [lamp(11, 30)];
    if (level >= 2) lamps.push(lamp(29, 24));
    if (level >= 3) lamps.push(lamp(45, 34));
    return `${shadow(32, 56, 27)}
      <path d="M4 55c10-3 18-2 26 0s18 2 30-1" stroke="#e7d7bd" stroke-width="5" stroke-linecap="round" fill="none"/>
      <g fill="url(#wa-stone)" stroke="#9a8d7f" stroke-width=".9"><ellipse cx="10" cy="55" rx="4" ry="1.8"/><ellipse cx="24" cy="54.6" rx="4.2" ry="1.9"/><ellipse cx="39" cy="55.2" rx="4" ry="1.8"/><ellipse cx="53" cy="54" rx="3.8" ry="1.7"/></g>
      ${lamps.join("")}`;
  },
  well: (level) => `${shadow(32, 56, 24)}
    <path d="M17 26h30M18 26v16M46 26v16" stroke="#8a5a2e" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M11 26 32 10l21 16Z" fill="url(#wa-roof)" stroke="#9c5826" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M17 22.6 32 12.6l15 10" stroke="#ffd29a" stroke-width="1.2" fill="none" opacity=".7"/>
    <path d="M32 26v9" stroke="#b28a5c" stroke-width="1"/>
    <path d="M28.6 35h6.8l-.8 5.4h-5.2Z" fill="#b77a45" stroke="#7d4f31" stroke-width="1"/>
    <path d="M14 42h36v8.6c0 2.4-8 3.8-18 3.8s-18-1.4-18-3.8Z" fill="url(#wa-stone)" stroke="#8f857b" stroke-width="1.3"/>
    <ellipse cx="32" cy="42" rx="18" ry="3.4" fill="#5fa8cf" stroke="#8f857b" stroke-width="1.3"/>
    <path d="M24 42.4c2-.8 4.2-.9 6.4-.4" stroke="#d6f1ff" stroke-width="1.1" stroke-linecap="round" fill="none"/>
    <path d="M18 47h7M28 48.6h8M39 47h7" stroke="#a69b8f" stroke-width="1" stroke-linecap="round"/>
    ${level >= 2 ? `<circle cx="47" cy="38.6" r="1.4" fill="#ffd25a"/><circle cx="50" cy="40" r="1" fill="#ffe7a0"/>` : ""}
    ${level >= 3 ? `<path d="M32 4.8l1.2 2.4 2.6.4-1.9 1.8.5 2.6-2.4-1.3-2.4 1.3.5-2.6-1.9-1.8 2.6-.4Z" fill="#ffd25a" stroke="#d29a2a" stroke-width=".8" stroke-linejoin="round"/>` : ""}`,
  silo: (level) => `${shadow(32, 56, 22)}
    <path d="M18 22h28v29a3 3 0 0 1-3 3H21a3 3 0 0 1-3-3Z" fill="url(#wa-silo)" stroke="#5a8fae" stroke-width="1.4"/>
    <path d="M16.6 23C17 13.6 23.6 7 32 7s15 6.6 15.4 16Z" fill="#7cc4e6" stroke="#3f86ad" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M22 16c2.4-3.4 5.8-5.2 10-5.4" stroke="#d8f2ff" stroke-width="1.4" stroke-linecap="round" fill="none"/>
    <path d="M18 31h28M18 41h28" stroke="#9cc6dc" stroke-width="1.2"/>
    <ellipse cx="32" cy="36" rx="5.4" ry="3.8" fill="#38b2e8" stroke="#1a8cc6" stroke-width="1.1"/>
    <ellipse cx="30.4" cy="34.8" rx="1.8" ry="1" fill="#fff" opacity=".9"/>
    <path d="M28 54v-7h8v7" fill="#a86f45" stroke="#7d4f31" stroke-width="1.1"/>
    ${level >= 2 ? `<path d="M46 33h7v18a3 3 0 0 1-3 3h-4" fill="url(#wa-silo)" stroke="#5a8fae" stroke-width="1.2"/><path d="M45.6 33.6c.4-4 2.6-6.4 4.4-6.4s4 2.4 4.4 6.4Z" fill="#7cc4e6" stroke="#3f86ad" stroke-width="1.1"/>` : ""}
    ${level >= 3 ? `<path d="M18 26h28" stroke="#ffd25a" stroke-width="2.2"/><circle cx="32" cy="7" r="1.8" fill="#ffd25a" stroke="#d29a2a" stroke-width=".8"/>` : ""}`,
  workshop: (level) => `${shadow(32, 56, 27)}
    <path d="M9 30h46v21a3 3 0 0 1-3 3H12a3 3 0 0 1-3-3Z" fill="url(#wa-plank)" stroke="#7d4f31" stroke-width="1.4"/>
    <path d="M15 31v23M21 31v23M43 31v23M49 31v23" stroke="#c38d5e" stroke-width="1" opacity=".7"/>
    <path d="M5.5 31.4 20 15l11 9 11-11 16.5 18.4Z" fill="#9db3c4" stroke="#5d7487" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M11 28.4 20 18.4l11 9 11-11 11 12" stroke="#d9e6ef" stroke-width="1.2" fill="none" stroke-linejoin="round" opacity=".8"/>
    <path d="M25 54V40h14v14" fill="#6e4329" stroke="#4f2f1c" stroke-width="1.2"/>
    <circle cx="32" cy="20.5" r="5.4" fill="#ffd25a" stroke="#c9861a" stroke-width="1.2"/>
    <circle cx="32" cy="20.5" r="2" fill="#c9861a"/>
    <path d="M32 13.6v2M32 25.4v2M25.1 20.5h2M36.9 20.5h2M27.1 15.6l1.4 1.4M35.5 24l1.4 1.4M27.1 25.4l1.4-1.4M35.5 17l1.4-1.4" stroke="#c9861a" stroke-width="1.6" stroke-linecap="round"/>
    ${level >= 2 ? `<path d="M46 44l7-7M48.6 36l5 5" stroke="#6e7b8a" stroke-width="2" stroke-linecap="round"/><path d="M12 44h9v4h-9Z" fill="#c9d2dc" stroke="#6e7b8a" stroke-width="1"/>` : ""}
    ${level >= 3 ? `<path d="M50.5 11.5c2.4 0 3.6 1.4 3.6 3.2v4" stroke="#b6b0a8" stroke-width="2.4" stroke-linecap="round" fill="none"/><circle cx="54" cy="9" r="2.2" fill="#ece7f6" opacity=".9"/><circle cx="57" cy="5.6" r="2.8" fill="#ece7f6" opacity=".7"/>` : ""}`,
  pier: (level) => `
    <path d="M2 46c8-2 14-2 22 0s16 2 22 0 12-2 16-.6V60H2Z" fill="url(#wa-lake)"/>
    <path d="M6 50c3-.8 5-.8 8 0M30 52c3-.8 6-.8 9 0M46 49c2-.6 4-.6 6 0" stroke="#d6f1ff" stroke-width="1.2" stroke-linecap="round" fill="none"/>
    <path d="M8 38h44v5H8Z" fill="url(#wa-plank)" stroke="#7d4f31" stroke-width="1.3"/>
    <path d="M17 38v5M26 38v5M35 38v5M44 38v5" stroke="#7d4f31" stroke-width=".9" opacity=".7"/>
    <path d="M12 43v12M48 43v12M30 43v10" stroke="#8a5a2e" stroke-width="3" stroke-linecap="round"/>
    <path d="M44 38 54 12" stroke="#8a5a2e" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M54 12c2 6 2 14 1 22" stroke="#e9e3f3" stroke-width=".8" fill="none"/>
    <circle cx="55" cy="35" r="1.4" fill="#e0705a" stroke="#a84a3a" stroke-width=".7"/>
    ${level >= 2 ? `<path d="M14 38v-8h8v8" fill="url(#wa-plank)" stroke="#7d4f31" stroke-width="1"/><path d="M13 30h10" stroke="#7d4f31" stroke-width="1.2"/>` : ""}
    ${level >= 3 ? `<path d="M26 26h4v12h-4Z" fill="#fff4e2" stroke="#a8794e" stroke-width="1"/><circle cx="28" cy="24" r="5" fill="url(#wa-glow)"/><circle cx="28" cy="24" r="2" fill="#ffd36b" stroke="#c9861a" stroke-width=".8"/>` : ""}`,
  windmill: (level) => `${shadow(32, 56, 18)}
    <path d="M24 54 27 24h10l3 30Z" fill="url(#wa-wall)" stroke="#a8794e" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M25.6 24.4C26 18 28.6 15 32 15s6 3 6.4 9.4Z" fill="url(#wa-roof)" stroke="#9c5826" stroke-width="1.3"/>
    <path d="M29 54v-8a3 3 0 0 1 6 0v8" fill="#9a6440" stroke="#6e4329" stroke-width="1.1"/>
    <circle cx="32" cy="34" r="2.2" fill="#ffe7a3" stroke="#a8794e" stroke-width="1"/>
    <g class="sails" style="transform-origin:32px 21px">
      <g fill="#f8f2e6" stroke="#8a5a2e" stroke-width="1.1" stroke-linejoin="round">
        <path d="M32 21 30.6 3.4l5.6.6Z"/><path d="M32 21l17.6-1.4-.6 5.6Z"/><path d="M32 21l1.4 17.6-5.6-.6Z"/><path d="M32 21 14.4 22.4l.6-5.6Z"/>
      </g>
      <path d="M32 21 33.4 4M32 21l17-1.4M32 21l-1.4 17M32 21 15 22.4" stroke="#8a5a2e" stroke-width="1.2"/>
    </g>
    <circle cx="32" cy="21" r="2.1" fill="#7d4f31"/>
    ${level >= 2 ? `<path d="M41 54c2-4 6-4 8 0" fill="url(#wa-hill)" stroke="#4f8a3d" stroke-width="1"/><path d="M9 53.6c1.6-3.2 5-3.2 6.6 0" fill="url(#wa-hill)" stroke="#4f8a3d" stroke-width="1"/>` : ""}
    ${level >= 3 ? `<path d="M46 10c3-1.4 6-1.4 9 0M48 15c2.4-1 4.8-1 7 0" stroke="#9fb8c9" stroke-width="1.3" stroke-linecap="round" fill="none"/>` : ""}`,
  observatory: (level) => `${shadow(32, 56, 24)}
    <path d="M12 36h40v16a2 2 0 0 1-2 2H14a2 2 0 0 1-2-2Z" fill="url(#wa-stone)" stroke="#8f857b" stroke-width="1.4"/>
    <path d="M12 42h40M12 48h40M22 36v6M36 42v6M26 48v6M44 36v6" stroke="#a69b8f" stroke-width="1"/>
    <path d="M10 37C10 24 19.8 15 32 15s22 9 22 22Z" fill="url(#wa-dome)" stroke="#5b49c4" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M16 28c3-5.6 8.6-9 14-9.6" stroke="#f1edff" stroke-width="1.4" stroke-linecap="round" fill="none"/>
    <path d="M30 16h6l-1 21h-4Z" fill="#4b4383" opacity=".75"/>
    <path d="M33 22 47 8.6" stroke="#6e7b8a" stroke-width="4.4" stroke-linecap="round"/>
    <path d="M33 22 47 8.6" stroke="#c9d2dc" stroke-width="2" stroke-linecap="round"/>
    <path d="M52.4 4.6l.9 1.9 2.1.3-1.5 1.4.4 2.1-1.9-1-1.9 1 .4-2.1-1.5-1.4 2.1-.3Z" fill="#ffd25a"/>
    ${level >= 2 ? `<path d="M8.6 10.4l.6 1.3 1.4.2-1 1 .2 1.4-1.2-.7-1.3.7.3-1.4-1-1 1.4-.2Z" fill="#cbbcff"/><circle cx="16" cy="7" r="1" fill="#ffe7a0"/>` : ""}
    ${level >= 3 ? `<path d="M26 54v-6h12v6" fill="#4b4383" stroke="#2f2a52" stroke-width="1"/><circle cx="32" cy="45" r="1.6" fill="#ffd25a"/>` : ""}`,
};

export function buildingArt(id: BuildingId, level: number, cls = "bld"): string {
  if (level <= 0) {
    return svg(
      `<g opacity=".55">${BUILDING[id](1)}</g>`,
      "0 0 64 64",
      `${cls} ${cls}--ghost`,
    );
  }
  return svg(BUILDING[id](level), "0 0 64 64", cls);
}

// ---- Plants in their beds ----------------------------------------------------

const PLANT_HUE: Record<PlantId, string> = {
  carrot: "#ef7d24",
  sunflower: "#f2b01e",
  clover: "#4ea64a",
  blueberry: "#4a56c2",
  lily: "#e47aa6",
  moonflower: "#8b78ee",
};

const soil = (water: boolean) =>
  water
    ? `<path d="M4 40c6-3.6 12-4.6 20-4.6s14 1 20 4.6v2c0 2.2-9 4-20 4S4 44.2 4 42Z" fill="url(#wa-lake)" stroke="#3f86ad" stroke-width="1.1"/>
       <path d="M10 41c2.6-1 5-1.2 7.4-.8M30 42.2c2-.6 4-.6 6 0" stroke="#d6f1ff" stroke-width="1" stroke-linecap="round" fill="none"/>`
    : `<path d="M4 40c6-3.6 12-4.6 20-4.6s14 1 20 4.6v2c0 2.2-9 4-20 4S4 44.2 4 42Z" fill="url(#wa-soil)" stroke="#5e3f2c" stroke-width="1.1"/>
       <path d="M10 39.6c2-.8 4-1.1 6-1M28 38.8c2.4-.3 4.4 0 6.4.8" stroke="#c99c78" stroke-width="1" stroke-linecap="round" fill="none"/>`;

const sprout = (hue: string) => `<path d="M24 38v-7" stroke="#4f8a3d" stroke-width="1.6" stroke-linecap="round"/>
  <path d="M24 32c-1-4-4.6-5.6-7.6-4.6 1 3.2 4 4.8 7.6 4.6ZM24 31.4c1.4-3.6 5-4.8 7.8-3.4-1.4 3-4.6 4.2-7.8 3.4Z" fill="url(#wa-leaf)" stroke="#3f7a35" stroke-width="1" stroke-linejoin="round"/>
  <circle cx="24" cy="38.6" r="1.4" fill="${hue}" opacity=".55"/>`;

const growing = (hue: string) => `<path d="M24 38V20" stroke="#4f8a3d" stroke-width="1.8" stroke-linecap="round"/>
  <g fill="url(#wa-leaf)" stroke="#3f7a35" stroke-width="1" stroke-linejoin="round">
    <path d="M24 34c-2-5-6.6-6.8-10.4-5.4 1.4 4.2 5.6 6.2 10.4 5.4Z"/><path d="M24 29c2-5 6.6-6.6 10.4-5 -1.6 4.2-5.8 6-10.4 5Z"/><path d="M24 23.6c-1.4-3.6-4.6-5-7.4-4 1 3 4 4.4 7.4 4Z"/>
  </g>
  <circle cx="24" cy="18.6" r="2.6" fill="${hue}" stroke="#3a2b25" stroke-opacity=".25" stroke-width=".8" opacity=".85"/>`;

const RIPE: Record<PlantId, string> = {
  carrot: `<g fill="url(#wa-leaf)" stroke="#3f7a35" stroke-width="1" stroke-linejoin="round">
      <path d="M22 33c-3.6-6-3.6-12-1-17 2.2 5 2.6 10.6 1 17Z"/><path d="M24.6 33c.4-7 3.6-12 8.4-14.4-.8 5.6-3.6 10.8-8.4 14.4Z"/><path d="M21 33.4c-4.4-3.6-9.4-4.4-13.4-2.6 3.4 3 8.2 3.8 13.4 2.6Z"/>
    </g>
    <path d="M17 30.6c0-2.4 3.2-3.6 7-3.6s7 1.2 7 3.6c0 1.8-1.2 3.6-2.4 6.2H19.4c-1.2-2.6-2.4-4.4-2.4-6.2Z" fill="#ff9a3c" stroke="#c45e17" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M19.6 29.8c1.4-.8 3-1.1 4.6-1M19.6 33.2l2.2.4M26.4 32.4l2.2-.6" stroke="#ffd2a3" stroke-width="1.1" stroke-linecap="round" fill="none"/>`,
  sunflower: `<path d="M24 38V14" stroke="#4f8a3d" stroke-width="2" stroke-linecap="round"/>
    <path d="M24 30c-3-4.6-7.6-5.4-11-3.6 2.2 3.6 6.6 5 11 3.6ZM24 26c3-4.2 7.4-5 10.6-3.4-2.2 3.4-6.4 4.6-10.6 3.4Z" fill="url(#wa-leaf)" stroke="#3f7a35" stroke-width="1" stroke-linejoin="round"/>
    <g fill="#ffd23f" stroke="#d99a12" stroke-width=".9" stroke-linejoin="round">
      ${Array.from({ length: 12 }, (_, i) => `<ellipse cx="24" cy="6.6" rx="2.2" ry="4.2" transform="rotate(${i * 30} 24 13)"/>`).join("")}
    </g>
    <circle cx="24" cy="13" r="4.6" fill="#7a4a24" stroke="#4f2f1c" stroke-width="1"/>
    <path d="M22 11.4h.01M25.4 11.6h.01M23.6 14.4h.01M26 14h.01M21.8 14.2h.01" stroke="#c9915c" stroke-width="1.4" stroke-linecap="round"/>`,
  clover: `<path d="M24 38c0-4-1-7-3-9.6" stroke="#3f7a35" stroke-width="1.6" stroke-linecap="round" fill="none"/>
    <g fill="url(#wa-leaf)" stroke="#3f7a35" stroke-width="1" stroke-linejoin="round">
      <path d="M21 28c-4.6-1.2-7.6-4-7-6.8.6-2.4 3.6-2.6 4.8-.6.6-2.4 3.6-3 4.8-.8 1.4 2.4-.2 5.4-2.6 8.2Z"/>
      <path d="M21.6 27.6c1.2-4.6 4-7.6 6.8-7 2.4.6 2.6 3.6.6 4.8 2.4.6 3 3.6.8 4.8-2.4 1.4-5.4-.2-8.2-2.6Z"/>
      <path d="M21.2 28.6c4.6 1.2 7.6 4 7 6.8-.6 2.4-3.6 2.6-4.8.6-.6 2.4-3.6 3-4.8.8-1.4-2.4.2-5.4 2.6-8.2Z"/>
      <path d="M20.6 28.8c-1.2 4.6-4 7.6-6.8 7-2.4-.6-2.6-3.6-.6-4.8-2.4-.6-3-3.6-.8-4.8 2.4-1.4 5.4.2 8.2 2.6Z"/>
    </g>
    <path d="M33 14.6l.7 1.5 1.6.2-1.2 1.1.3 1.6-1.4-.8-1.4.8.3-1.6-1.2-1.1 1.6-.2Z" fill="#ffe57a"/>`,
  blueberry: `<path d="M8 38c-1.4-7 3-14 10-15.6C20 17 26 14.6 31 17c5.4-.2 9.6 4.6 9.4 10 1.4 4.6.2 8.6-2.4 11Z" fill="url(#wa-leaf)" stroke="#3f7a35" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M14 30c2.4-3.4 6-5 9.6-5M28 22c3 .2 5.4 1.6 7 4" stroke="#a9de8a" stroke-width="1.2" stroke-linecap="round" fill="none"/>
    <g fill="#5866d4" stroke="#2f377f" stroke-width=".9">
      <circle cx="15" cy="33" r="2.6"/><circle cx="20.4" cy="29" r="2.6"/><circle cx="27" cy="31.6" r="2.6"/><circle cx="33" cy="26.4" r="2.6"/><circle cx="35" cy="33.4" r="2.6"/><circle cx="24" cy="23.4" r="2.4"/>
    </g>
    <g fill="#c9d0ff"><circle cx="14.2" cy="32.2" r=".8"/><circle cx="19.6" cy="28.2" r=".8"/><circle cx="26.2" cy="30.8" r=".8"/><circle cx="32.2" cy="25.6" r=".8"/><circle cx="34.2" cy="32.6" r=".8"/></g>`,
  lily: `<path d="M9 38.6c3-3.6 8.6-5 14-4.4l-2 3.4 5.4-2.6c4.6 1 8 3 9.6 5.6-4 2.4-10.6 3.4-16.6 3S11.4 41.2 9 38.6Z" fill="url(#wa-leaf)" stroke="#3f7a35" stroke-width="1" stroke-linejoin="round"/>
    <g stroke="#c4517f" stroke-width="1" stroke-linejoin="round">
      <path d="M24 34c-4.4-1.4-6.6-5.2-5.4-9.6 3.6 1 5.6 5 5.4 9.6Z" fill="#f7a8c8"/>
      <path d="M24 34c4.4-1.4 6.6-5.2 5.4-9.6-3.6 1-5.6 5-5.4 9.6Z" fill="#f7a8c8"/>
      <path d="M24 34c-2.4-3.4-2.4-8 0-11.6 2.4 3.6 2.4 8.2 0 11.6Z" fill="#ffd3e4"/>
    </g>
    <circle cx="24" cy="31" r="1.6" fill="#ffd25a"/>`,
  moonflower: `<circle cx="24" cy="20" r="16" fill="url(#wa-moon)"/>
    <path d="M24 38c0-6-2-10-1-15" stroke="#4f8a3d" stroke-width="1.6" stroke-linecap="round" fill="none"/>
    <path d="M23.4 33c-3.4-2.4-7.4-2.4-10 0 3 2 6.8 2.2 10 0Z" fill="url(#wa-leaf)" stroke="#3f7a35" stroke-width="1"/>
    <g fill="#f6f1ff" stroke="#8b78ee" stroke-width="1" stroke-linejoin="round">
      ${Array.from({ length: 5 }, (_, i) => `<path d="M23 21c-2.6-3-2.6-7 0-10 2.6 3 2.6 7 0 10Z" transform="rotate(${i * 72} 23 21)"/>`).join("")}
    </g>
    <circle cx="23" cy="21" r="2.4" fill="#ffe7a0" stroke="#d9a62a" stroke-width=".8"/>
    <circle cx="36" cy="9" r="1" fill="#ffe7a0"/><circle cx="10" cy="13" r=".8" fill="#e7deff"/>`,
};

/** A bed: stage 0 empty, 1 sprout, 2 growing, 3 ripe. */
export function plantArt(plant: PlantId | null, stage: number, water = false, cls = "bed-art"): string {
  let body = soil(water);
  if (plant && stage >= 3) body += RIPE[plant];
  else if (plant && stage === 2) body += growing(PLANT_HUE[plant]);
  else if (plant && stage === 1) body += sprout(PLANT_HUE[plant]);
  return svg(body, "0 0 48 48", cls);
}

/** Growth stage from progress: just planted, under half, half or more, ripe. */
export function stageOf(growth: number, need: number): number {
  if (growth >= need) return 3;
  return growth * 2 >= need ? 2 : 1;
}

// ---- Areas -------------------------------------------------------------------

const AREA: Record<AreaId, string> = {
  meadow: `<rect width="160" height="72" fill="url(#wa-sky)"/>
    <circle cx="132" cy="16" r="8" fill="#fff3c4"/><circle cx="132" cy="16" r="14" fill="#fff3c4" opacity=".35"/>
    <path d="M18 18c3-3 8-3 10 0 3-1 6 1 6 3H14c0-1.6 1.6-3 4-3Z" fill="#fff" opacity=".9"/>
    <path d="M0 50c22-12 50-14 78-6s52 4 82-6v34H0Z" fill="url(#wa-hill2)"/>
    <path d="M0 58c30-10 64-10 96-2s46 4 64-2v18H0Z" fill="url(#wa-hill)"/>
    <path d="M52 40h20v12H52Z" fill="url(#wa-wall)" stroke="#a8794e" stroke-width="1"/>
    <path d="M49 41.6C50.4 34 55.4 30 62 30s11.6 4 13 11.6Z" fill="url(#wa-roof)" stroke="#9c5826" stroke-width="1"/>
    <path d="M60 52v-5a2 2 0 0 1 4 0v5" fill="#9a6440"/>
    <g fill="#f28aa0"><circle cx="20" cy="62" r="1.6"/><circle cx="34" cy="66" r="1.4"/><circle cx="108" cy="64" r="1.6"/></g>
    <g fill="#ffd25a"><circle cx="26" cy="66" r="1.4"/><circle cx="118" cy="60" r="1.4"/><circle cx="140" cy="66" r="1.6"/></g>`,
  forest: `<rect width="160" height="72" fill="url(#wa-sky)"/>
    <path d="M0 52c30-8 60-8 90-2s50 2 70-4v26H0Z" fill="url(#wa-hill)"/>
    ${[
      [14, 44, 1],
      [34, 40, 1.2],
      [58, 46, 0.9],
      [84, 38, 1.3],
      [110, 44, 1],
      [136, 40, 1.15],
    ]
      .map(
        ([x, y, s]) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-1.6 12h3.2v8h-3.2Z" fill="#8a5a2e"/>
      <path d="M0-22 12 0H5l9 12H-14l9-12h-7Z" fill="#5f9e4f" stroke="#3f7a35" stroke-width="1.2" stroke-linejoin="round"/>
      <path d="M-3-10 0-16M-5 2l3-5" stroke="#9fd27e" stroke-width="1.4" stroke-linecap="round"/></g>`,
      )
      .join("")}
    <g fill="#ffe57a"><circle cx="46" cy="30" r="1.2"/><circle cx="98" cy="24" r="1"/><circle cx="124" cy="30" r="1.2"/></g>`,
  lake: `<rect width="160" height="72" fill="url(#wa-sky)"/>
    <path d="M0 40c20-6 40-8 60-6s40 6 60 4 30-4 40-6v40H0Z" fill="url(#wa-hill2)"/>
    <path d="M10 50c20-6 50-8 80-6s46 4 60 8c-10 10-40 16-76 16S14 62 10 50Z" fill="url(#wa-lake)" stroke="#3f86ad" stroke-width="1"/>
    <path d="M30 54c6-1.6 12-1.6 18 0M80 58c8-1.6 16-1.6 22 0M60 64c5-1 10-1 14 0" stroke="#d6f1ff" stroke-width="1.4" stroke-linecap="round" fill="none"/>
    <path d="M112 46h26v3h-26Z" fill="url(#wa-plank)" stroke="#7d4f31" stroke-width=".9"/>
    <path d="M116 49v8M134 49v8" stroke="#8a5a2e" stroke-width="2" stroke-linecap="round"/>
    <g fill="url(#wa-leaf)" stroke="#3f7a35" stroke-width=".8"><ellipse cx="50" cy="60" rx="6" ry="2"/><ellipse cx="94" cy="54" rx="5" ry="1.8"/></g>
    <circle cx="51" cy="58.6" r="1.6" fill="#f7a8c8"/>
    <path d="M12 52v-12M15 52v-9M18 52v-13" stroke="#6f9a45" stroke-width="1.6" stroke-linecap="round"/>
    <g fill="#8a5a2e"><ellipse cx="12" cy="40" rx="1.2" ry="3"/><ellipse cx="18" cy="39" rx="1.2" ry="3"/></g>`,
  hills: `<rect width="160" height="72" fill="url(#wa-sky)"/>
    <path d="M14 22c10-2 18-2 26 0M100 14c10-2 18-2 26 0M84 28c6-1.4 12-1.4 18 0" stroke="#fff" stroke-width="2" stroke-linecap="round" fill="none" opacity=".8"/>
    <path d="M0 46c14-16 34-20 52-10s30 6 44-6 40-10 64 6v36H0Z" fill="url(#wa-hill2)"/>
    <path d="M0 60c24-12 56-14 88-6s52 2 72-4v22H0Z" fill="url(#wa-hill)"/>
    <path d="M96 48 98 30h6l2 18Z" fill="url(#wa-wall)" stroke="#a8794e" stroke-width="1"/>
    <g fill="#f8f2e6" stroke="#8a5a2e" stroke-width=".9"><path d="M101 26 100 14l4 .4Z"/><path d="M101 26l12-1-.4 4Z"/><path d="M101 26l1 12-4-.4Z"/><path d="M101 26 89 27l.4-4Z"/></g>
    <circle cx="101" cy="26" r="1.4" fill="#7d4f31"/>
    <g fill="#e9f0c2"><circle cx="30" cy="58" r="1.2"/><circle cx="60" cy="62" r="1.2"/><circle cx="130" cy="58" r="1.2"/></g>`,
  ruins: `<rect width="160" height="72" fill="url(#wa-dusk)"/>
    <circle cx="128" cy="18" r="9" fill="#f6f1ff"/><circle cx="132" cy="15" r="8" fill="#6a5ea8" opacity=".9"/>
    <g fill="#fff6c8"><circle cx="20" cy="12" r="1"/><circle cx="46" cy="22" r="1.2"/><circle cx="70" cy="8" r=".9"/><circle cx="96" cy="18" r="1.1"/><circle cx="150" cy="34" r=".9"/></g>
    <path d="M0 56c30-8 60-10 92-6s48 2 68-2v24H0Z" fill="#6c5f9e"/>
    <g fill="#d9d1ea" stroke="#8a7fb4" stroke-width="1">
      <path d="M30 56V30h8v26Z"/><path d="M28 30h12v-3H28Z"/>
      <path d="M58 56V38h8v18Z"/><path d="M56 38h12v-3H56Z"/>
      <path d="M88 56V44l8-2v14Z"/>
    </g>
    <path d="M26 56h48" stroke="#8a7fb4" stroke-width="1.4"/>
    <path d="M112 50c2-8 10-12 18-10" stroke="#b9a8ff" stroke-width="1" stroke-dasharray="2 3" fill="none"/>
    <circle cx="112" cy="50" r="2" fill="#f6f1ff"/>`,
};

export function areaArt(id: AreaId, cls = "area-art"): string {
  return svg(AREA[id], "0 0 160 72", cls);
}

// ---- Bosses ------------------------------------------------------------------

const BOSS: Record<BossId, string> = {
  tangerine: `<circle cx="48" cy="48" r="46" fill="#fff1dc"/>
    <path d="M14 70c-2-18 10-34 30-36 6-8 18-10 26-4l6-10 4 14c6 6 8 16 4 26-2 8-10 14-22 14H26c-6 0-11-1.6-12-4Z" fill="url(#wa-cat)" stroke="#b5641f" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M44 34 40 22l10 8M70 30l6-10 2 12" fill="url(#wa-cat)" stroke="#b5641f" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M30 50c4-2 9-2 12 0M54 50c3-2 8-2 11 0" stroke="#5a3415" stroke-width="2" stroke-linecap="round" fill="none"/>
    <path d="M45 56l3 2 3-2" stroke="#5a3415" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <path d="M22 44c6 2 10 0 14-3M62 40c4 3 9 4 14 2M30 66c8 2 20 2 30-1" stroke="#d27a2c" stroke-width="2.2" stroke-linecap="round" fill="none" opacity=".7"/>
    <path d="M28 56h-8M28 59l-7 2M68 56h8M68 59l7 2" stroke="#fff" stroke-width="1.1" stroke-linecap="round"/>
    <path d="M78 72c8 0 12-4 12-10" stroke="url(#wa-cat)" stroke-width="7" stroke-linecap="round" fill="none"/>
    <path d="M80 30h5l-5 6h5M85 16h7l-7 8h7" stroke="#c0702c" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  clockcrow: `<circle cx="48" cy="48" r="46" fill="#e6e9f1"/>
    <g transform="translate(70 26)"><circle r="10" fill="#c9d2dc" stroke="#6e7b8a" stroke-width="1.4"/>
      ${Array.from({ length: 8 }, (_, i) => `<rect x="-2" y="-14" width="4" height="5" rx="1" fill="#c9d2dc" stroke="#6e7b8a" stroke-width="1" transform="rotate(${i * 45})"/>`).join("")}
      <circle r="3.4" fill="#6e7b8a"/></g>
    <path d="M18 64c0-18 12-32 28-32 14 0 26 10 26 26 0 12-8 22-24 22S18 76 18 64Z" fill="#3c3a4c" stroke="#232230" stroke-width="1.6"/>
    <path d="M62 50 86 54l-24 6Z" fill="#f0b43c" stroke="#b9812a" stroke-width="1.3" stroke-linejoin="round"/>
    <circle cx="54" cy="48" r="7" fill="#ffd25a" stroke="#b9812a" stroke-width="1.4"/>
    <circle cx="54" cy="48" r="3.2" fill="#232230"/><circle cx="55.4" cy="46.6" r="1.1" fill="#fff"/>
    <path d="M54 41v-2M54 57v-2M47 48h-2M63 48h-2" stroke="#b9812a" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M26 58c6 6 14 9 22 9" stroke="#5a576e" stroke-width="2" stroke-linecap="round" fill="none"/>
    <path d="M34 34c2-6 6-9 11-9-2 3-2 6-1 9" fill="#3c3a4c" stroke="#232230" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M40 80l-2 8M50 80l1 8" stroke="#f0b43c" stroke-width="2.4" stroke-linecap="round"/>`,
  fogserpent: `<circle cx="48" cy="48" r="46" fill="#eef1f8"/>
    <g fill="url(#wa-fog)" opacity=".95"><circle cx="20" cy="70" r="12"/><circle cx="36" cy="76" r="12"/><circle cx="58" cy="76" r="13"/><circle cx="76" cy="70" r="12"/></g>
    <path d="M24 70c0-10 10-14 20-12s20 2 22-8-6-16-14-16" stroke="#8fa3c9" stroke-width="12" stroke-linecap="round" fill="none"/>
    <path d="M24 70c0-10 10-14 20-12s20 2 22-8-6-16-14-16" stroke="#b9c8e6" stroke-width="5" stroke-linecap="round" fill="none" opacity=".7"/>
    <path d="M36 30c0-8 6-14 15-14s15 6 15 13c0 6-5 10-12 10H44c-5 0-8-4-8-9Z" fill="#9db0d4" stroke="#5f73a0" stroke-width="1.6"/>
    <circle cx="46" cy="26" r="3" fill="#fff"/><circle cx="58" cy="26" r="3" fill="#fff"/>
    <circle cx="46.6" cy="26.4" r="1.6" fill="#2f3a5a"/><circle cx="58.6" cy="26.4" r="1.6" fill="#2f3a5a"/>
    <path d="M50 34c1.6 1 3.4 1 5 0" stroke="#5f73a0" stroke-width="1.4" stroke-linecap="round" fill="none"/>
    <path d="M52 38v5l-2 2M52 43l2 2" stroke="#e0705a" stroke-width="1.3" stroke-linecap="round" fill="none"/>
    <g fill="#fff" opacity=".85"><circle cx="16" cy="40" r="5"/><circle cx="23" cy="37" r="6"/><circle cx="80" cy="44" r="5"/><circle cx="74" cy="40" r="4"/></g>`,
  frostowl: `<circle cx="48" cy="48" r="46" fill="#e9f4fa"/>
    <circle cx="76" cy="20" r="8" fill="#f6f1ff"/><circle cx="79" cy="18" r="7" fill="#e9f4fa"/>
    <path d="M24 44c0-14 10-26 24-26s24 12 24 26v14c0 14-10 24-24 24S24 72 24 58Z" fill="url(#wa-frost)" stroke="#6c9db8" stroke-width="1.6"/>
    <path d="M26 24 22 12l10 8M70 24l4-12-10 8" fill="#d8ecf6" stroke="#6c9db8" stroke-width="1.4" stroke-linejoin="round"/>
    <circle cx="38" cy="42" r="8" fill="#fff" stroke="#6c9db8" stroke-width="1.3"/><circle cx="58" cy="42" r="8" fill="#fff" stroke="#6c9db8" stroke-width="1.3"/>
    <circle cx="39" cy="43" r="3.6" fill="#2f4a5a"/><circle cx="57" cy="43" r="3.6" fill="#2f4a5a"/>
    <circle cx="40.2" cy="41.8" r="1.2" fill="#fff"/><circle cx="58.2" cy="41.8" r="1.2" fill="#fff"/>
    <path d="M44.6 50h6.8L48 55Z" fill="#f0b43c" stroke="#b9812a" stroke-width="1" stroke-linejoin="round"/>
    <path d="M38 62c1.2 1.4 2.8 1.4 4 0M46 62c1.2 1.4 2.8 1.4 4 0M54 62c1.2 1.4 2.8 1.4 4 0M42 68c1.2 1.4 2.8 1.4 4 0M50 68c1.2 1.4 2.8 1.4 4 0" stroke="#9cc4da" stroke-width="1.3" stroke-linecap="round" fill="none"/>
    <g stroke="#9cc4da" stroke-width="1.2" stroke-linecap="round"><path d="M14 30v8M10 34h8M11.2 31.2l5.6 5.6M16.8 31.2l-5.6 5.6"/><path d="M84 60v6M81 63h6"/></g>`,
};

export function bossArt(id: BossId, cls = "boss-art"): string {
  return svg(BOSS[id], "0 0 96 96", cls);
}

// ---- Guild crests ------------------------------------------------------------

const CREST_COLORS: Record<GuildId, [string, string]> = {
  seed: ["#7fbf6a", "#3f7a35"],
  lantern: ["#f0b45a", "#a8661c"],
  cog: ["#a4adba", "#56606e"],
  star: ["#a898f0", "#5b49c4"],
};

const EMBLEM: Record<GuildId, string> = {
  seed: `<path d="M16 23v-7" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/><path d="M16 17c-1-3.4-4-4.8-6.6-4 .8 2.8 3.6 4.4 6.6 4ZM16 16.4c1.2-3 4.2-4.2 6.6-3-1.2 2.6-4 3.6-6.6 3Z" fill="#fff"/>`,
  lantern: `<path d="M13 10h6M16 8v2" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/><rect x="12" y="11" width="8" height="10" rx="3.4" fill="#fff"/><path d="M16 14c.8 1.2.8 2.4 0 3.6" stroke="#f0b45a" stroke-width="1.3" stroke-linecap="round"/>`,
  cog: `<circle cx="16" cy="16" r="4.2" fill="none" stroke="#fff" stroke-width="2.2"/><path d="M16 9.4v2M16 20.6v2M9.4 16h2M20.6 16h2M11.3 11.3l1.4 1.4M19.3 19.3l1.4 1.4M11.3 20.7l1.4-1.4M19.3 12.7l1.4-1.4" stroke="#fff" stroke-width="2" stroke-linecap="round"/>`,
  star: `<path d="M16 8.6l2.2 4.5 5 .7-3.6 3.5.9 4.9-4.5-2.4-4.5 2.4.9-4.9-3.6-3.5 5-.7Z" fill="#fff"/>`,
};

export function guildCrest(id: GuildId, cls = "crest"): string {
  const [fill, ink] = CREST_COLORS[id];
  return svg(
    `<path d="M16 2.6 27 6.4v8.4c0 6.6-4.6 11.6-11 14.6C9.6 26.4 5 21.4 5 14.8V6.4Z" fill="${fill}" stroke="${ink}" stroke-width="1.4" stroke-linejoin="round"/>
     <path d="M8 8.4 16 5.6" stroke="#fff" stroke-width="1.2" stroke-linecap="round" opacity=".55"/>${EMBLEM[id]}`,
    "0 0 32 32",
    cls,
  );
}

/** Paw prints for the trail. */
export const PAW = svg(
  `<ellipse cx="12" cy="15.4" rx="4.6" ry="3.9" fill="currentColor"/><circle cx="6.6" cy="10" r="1.9" fill="currentColor"/><circle cx="10" cy="6.8" r="1.9" fill="currentColor"/><circle cx="14" cy="6.8" r="1.9" fill="currentColor"/><circle cx="17.4" cy="10" r="1.9" fill="currentColor"/>`,
  "0 0 24 24",
  "paw",
);

/** A treasure chest in a tier color. */
export function chestArt(tier: "bronze" | "silver" | "gold" | "rainbow" | null, open = false, cls = "chest-art"): string {
  const colors: Record<string, [string, string, string]> = {
    none: ["#e9e1d6", "#bdb1a2", "#9a8d7f"],
    bronze: ["#e3a370", "#b8713f", "#7d4f31"],
    silver: ["#eef2f6", "#b9c3cf", "#6e7b8a"],
    gold: ["#ffe08a", "#e2a92c", "#a8761c"],
    rainbow: ["#ffd3e4", "#a898f0", "#5b49c4"],
  };
  const [light, mid, ink] = colors[tier ?? "none"];
  const band = tier === "rainbow" ? `<path d="M10 33h44" stroke="#7fd0f0" stroke-width="2"/><path d="M10 36h44" stroke="#ffd25a" stroke-width="2"/>` : "";
  const lid = open
    ? `<path d="M10 22 14 8h36l4 14Z" fill="${mid}" stroke="${ink}" stroke-width="1.4" stroke-linejoin="round"/><circle cx="32" cy="24" r="12" fill="url(#wa-glow)"/>`
    : `<path d="M10 28c0-8 6-12 22-12s22 4 22 12Z" fill="${mid}" stroke="${ink}" stroke-width="1.4" stroke-linejoin="round"/><path d="M16 22c4-2.6 9-3.6 16-3.6" stroke="${light}" stroke-width="1.6" stroke-linecap="round" fill="none"/>`;
  return svg(
    `${shadow(32, 56, 24)}${lid}
     <path d="M10 28h44v22a3 3 0 0 1-3 3H13a3 3 0 0 1-3-3Z" fill="${light}" stroke="${ink}" stroke-width="1.4"/>
     ${band}
     <path d="M10 30h44" stroke="${ink}" stroke-width="1" opacity=".5"/>
     <rect x="28" y="27" width="8" height="10" rx="2" fill="${mid}" stroke="${ink}" stroke-width="1.2"/>
     <circle cx="32" cy="32" r="1.4" fill="${ink}"/>`,
    "0 0 64 64",
    cls,
  );
}
