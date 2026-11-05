import type { ItemId, NpcId, PlantId, ResourceId } from "../types";

// Small pictures for the bag, buttons and diary: soft shapes, a light top
// edge and a darker outline in the same hue, matching the pet's palette.
// Every drawing is our own static markup, so it is safe to insert as HTML.

const svg = (body: string, view = "0 0 24 24", cls = "ico") =>
  `<svg class="${cls}" viewBox="${view}" aria-hidden="true" focusable="false">${body}</svg>`;

/** Shared gradients, inserted once per page (see `artDefs`). */
export function artDefs(): string {
  return `<svg class="art-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>
    <linearGradient id="w-bean" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fe6ff"/><stop offset="1" stop-color="#22a6e0"/></linearGradient>
    <radialGradient id="w-bean-glow"><stop offset="0" stop-color="#9eeaff" stop-opacity=".8"/><stop offset="1" stop-color="#38c2f2" stop-opacity="0"/></radialGradient>
    <linearGradient id="w-dew" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ddd2ff"/><stop offset="1" stop-color="#8b78ee"/></linearGradient>
    <linearGradient id="w-crystal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d6f4ff"/><stop offset=".5" stop-color="#9ccfff"/><stop offset="1" stop-color="#8a86f2"/></linearGradient>
    <linearGradient id="w-carrot" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffab4a"/><stop offset="1" stop-color="#ef7d24"/></linearGradient>
    <linearGradient id="w-wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c58b5c"/><stop offset="1" stop-color="#9a6440"/></linearGradient>
    <radialGradient id="w-berry" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#9aa8ff"/><stop offset="1" stop-color="#4a56c2"/></radialGradient>
    <radialGradient id="w-glow-warm"><stop offset="0" stop-color="#fff2b8" stop-opacity=".95"/><stop offset=".45" stop-color="#ffd36b" stop-opacity=".45"/><stop offset="1" stop-color="#ffd36b" stop-opacity="0"/></radialGradient>
    <radialGradient id="w-glow-moon"><stop offset="0" stop-color="#f4efff" stop-opacity=".95"/><stop offset=".5" stop-color="#cbbcff" stop-opacity=".35"/><stop offset="1" stop-color="#cbbcff" stop-opacity="0"/></radialGradient>
    <radialGradient id="w-glow-ripe"><stop offset="0" stop-color="#fffbe0" stop-opacity=".9"/><stop offset="1" stop-color="#fff2a0" stop-opacity="0"/></radialGradient>
    <linearGradient id="w-soil" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9b6b4b"/><stop offset="1" stop-color="#6f4a33"/></linearGradient>
    <linearGradient id="w-water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fdcf0"/><stop offset="1" stop-color="#5fb2d6"/></linearGradient>
    <linearGradient id="w-stone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9e3f3"/><stop offset="1" stop-color="#c3b8d8"/></linearGradient>
  </defs></svg>`;
}

const RES: Record<ResourceId, string> = {
  beans: `<circle cx="12" cy="12" r="10" fill="url(#w-bean-glow)"/>
    <ellipse cx="12" cy="12.4" rx="7.4" ry="5.6" fill="url(#w-bean)" stroke="#1a8cc6" stroke-width="1.2"/>
    <ellipse cx="9.6" cy="10.3" rx="2.6" ry="1.4" fill="#fff" opacity=".9"/>`,
  dew: `<path d="M12 2.8c-.4.6-6.6 8-6.6 12.1a6.6 6.6 0 0 0 13.2 0C18.6 10.8 12.4 3.4 12 2.8Z" fill="url(#w-dew)" stroke="#6f5ad6" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M9.2 13.4c-.2 1.7.5 3.2 1.8 4" stroke="#fff" stroke-width="1.5" stroke-linecap="round" opacity=".85" fill="none"/>
    <circle cx="16.8" cy="5.6" r="1.1" fill="#b9a8ff"/>`,
  wood: `<rect x="3" y="8" width="16" height="9" rx="4.5" fill="url(#w-wood)" stroke="#7d4f31" stroke-width="1.1"/>
    <ellipse cx="17.5" cy="12.5" rx="3.6" ry="4.5" fill="#efcf9c" stroke="#7d4f31" stroke-width="1.1"/>
    <ellipse cx="17.5" cy="12.5" rx="1.7" ry="2.2" fill="none" stroke="#c89b66" stroke-width=".9"/>
    <path d="M6 10.6h6.5M7.5 14.5h5" stroke="#e2b07e" stroke-width="1" stroke-linecap="round"/>`,
  stone: `<ellipse cx="9" cy="15" rx="6.2" ry="4.6" fill="#cfc6bd" stroke="#8f857b" stroke-width="1.1"/>
    <ellipse cx="16.2" cy="16.4" rx="4.4" ry="3.3" fill="#b9aea3" stroke="#857a70" stroke-width="1.1"/>
    <ellipse cx="13.6" cy="9.4" rx="4.2" ry="3.2" fill="#ddd6ce" stroke="#968c82" stroke-width="1.1"/>
    <path d="M6.4 13.2c1-.9 2.3-1.2 3.6-1M12.2 8.4c.8-.6 1.8-.8 2.8-.6" stroke="#fff" stroke-width="1" stroke-linecap="round" opacity=".8" fill="none"/>`,
  crystal: `<path d="M12 2.5 18.5 9 12 21.5 5.5 9Z" fill="url(#w-crystal)" stroke="#5f6bd1" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M5.5 9h13M12 2.5 9.4 9 12 21.5 14.6 9Z" fill="none" stroke="#5f6bd1" stroke-width=".8" stroke-linejoin="round" opacity=".55"/>
    <path d="M9.4 9 12 2.5 7.7 6.8Z" fill="#fff" opacity=".7"/>
    <path d="M19.5 3.2v3M18 4.7h3" stroke="#a7b6ff" stroke-width="1.1" stroke-linecap="round"/>`,
  carrot: `<path d="M12.5 7.2c3.2.2 5 2.3 4.3 4.6L9.6 21c-.6.8-1.8.5-1.9-.5L6.6 11c-.1-2.4 2.7-4 5.9-3.8Z" fill="url(#w-carrot)" stroke="#c45e17" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M9.3 12.4l2 .6M8.6 15.6l1.8.4M12.8 11.2l1.6.8" stroke="#c45e17" stroke-width=".9" stroke-linecap="round" opacity=".7"/>
    <path d="M12.4 7.3c-.6-2.4.2-4.4 1.6-5.2.4 1.9.1 3.6-.6 5.2M13.6 7.6c1.2-2 3.2-3 5-2.6-.8 1.6-2.4 2.6-4.4 3M11.6 7.4c-1.6-1.4-3.6-1.7-5-.9 1.2 1.1 2.9 1.4 4.6 1.4" fill="#6cc05a" stroke="#3f8c3a" stroke-width=".9" stroke-linejoin="round"/>`,
  sunseed: `<path d="M12 2.8c3.4 2.6 4.8 7.4 3.6 12.2-.7 2.9-2.1 5-3.6 6.2-1.5-1.2-2.9-3.3-3.6-6.2C7.2 10.2 8.6 5.4 12 2.8Z" fill="#3f3633" stroke="#221c1a" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M12 4.6v15M9.6 8.2c.4 3.6.3 7.2-.4 9.4M14.4 8.2c-.4 3.6-.3 7.2.4 9.4" stroke="#efe6dc" stroke-width="1.1" stroke-linecap="round" fill="none"/>`,
  berry: `<circle cx="9" cy="14" r="5.4" fill="url(#w-berry)" stroke="#3a43a3" stroke-width="1.1"/>
    <circle cx="15.6" cy="11" r="4.6" fill="url(#w-berry)" stroke="#3a43a3" stroke-width="1.1"/>
    <path d="M7.6 10.4l1.4 1.2 1.4-1.2M14.4 7.8l1.2 1 1.2-1" stroke="#2f377f" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <path d="M15.4 6.4c.6-1.8 2-3 3.8-3.2-.2 1.6-1.4 2.8-3.2 3.4" fill="#6cc05a" stroke="#3f8c3a" stroke-width=".9" stroke-linejoin="round"/>`,
  clover: `<g fill="#6cc05a" stroke="#3f8c3a" stroke-width="1" stroke-linejoin="round">
      <path d="M12 11.4C9.6 9.8 7 9 6.2 7.2 5.4 5.4 7.6 3.6 9.4 4.6c.6-2 3.6-2 3.9.2.4 2.3-.4 4.4-1.3 6.6Z"/>
      <path d="M12.6 12c1.6-2.4 2.4-5 4.2-5.8 1.8-.8 3.6 1.4 2.6 3.2 2 .6 2 3.6-.2 3.9-2.3.4-4.4-.4-6.6-1.3Z"/>
      <path d="M12 12.6c2.4 1.6 5 2.4 5.8 4.2.8 1.8-1.4 3.6-3.2 2.6-.6 2-3.6 2-3.9-.2-.4-2.3.4-4.4 1.3-6.6Z"/>
      <path d="M11.4 12c-1.6 2.4-2.4 5-4.2 5.8-1.8.8-3.6-1.4-2.6-3.2-2-.6-2-3.6.2-3.9 2.3-.4 4.4.4 6.6 1.3Z"/>
    </g>
    <path d="M12 12.2c1.6 3 2.4 6.2 2.2 9.6" stroke="#3f8c3a" stroke-width="1.3" stroke-linecap="round" fill="none"/>`,
};

export function resIcon(id: ResourceId, cls = "ico"): string {
  return svg(RES[id], "0 0 24 24", cls);
}

const ITEMS: Record<ItemId, string> = {
  lamp: `<circle cx="12" cy="13.5" r="9" fill="url(#w-glow-warm)"/>
    <path d="M9 6.2h6M12 2.8v3.4" stroke="#6b4a2f" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M8.2 8.2h7.6l1 9.6c0 1-1.2 1.8-4.8 1.8s-4.8-.8-4.8-1.8Z" fill="#ffe7a3" stroke="#8a5a2e" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M12 11.2c1.2 1.4 1.4 2.7.7 3.8-.5.7-1.1.8-1.6.4-.9-.8-.4-2.6.9-4.2Z" fill="#ff9e3d"/>
    <rect x="7.2" y="6.4" width="9.6" height="2.4" rx="1.1" fill="#b77a45" stroke="#8a5a2e" stroke-width="1"/>`,
  rope: `<ellipse cx="12" cy="13" rx="8" ry="6.4" fill="none" stroke="#c99a5b" stroke-width="3.2"/>
    <ellipse cx="12" cy="13" rx="4.6" ry="3.4" fill="none" stroke="#b5833f" stroke-width="2.6"/>
    <path d="M18.6 16.4c1.4 1.4 2 3 1.6 4.6" stroke="#c99a5b" stroke-width="2.6" stroke-linecap="round" fill="none"/>
    <path d="M6 10.6l1.6 1M8 7.8l1.2 1.4M12 6.6v1.8M16 7.8l-1.2 1.4M18 10.6l-1.6 1" stroke="#8f6530" stroke-width=".9" stroke-linecap="round"/>`,
  map: `<path d="M3.6 6.4 8.6 4.6l6.8 2.2 5-1.8v13l-5 1.8-6.8-2.2-5 1.8Z" fill="#f6ead2" stroke="#9c7a4c" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M8.6 4.6v13M15.4 6.8v13" stroke="#cdb489" stroke-width=".9"/>
    <path d="M5.8 15.6c2-1.4 3.2-3.8 5.6-3.6 2.2.2 2.6 2.6 5 1.6" stroke="#e0705a" stroke-width="1.2" stroke-dasharray="1.6 1.6" stroke-linecap="round" fill="none"/>
    <path d="M16.6 9.6l1.8 1.8M18.4 9.6l-1.8 1.8" stroke="#e0705a" stroke-width="1.3" stroke-linecap="round"/>`,
  trowel: `<path d="M13.8 3.6c2.6-.4 5.4.8 6.4 3.4l-6.2 6.2c-2.6-1-3.8-3.8-3.4-6.4Z" fill="#c9d2dc" stroke="#6e7b8a" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M14.6 5.4c1.6 0 3 .8 3.6 2" stroke="#fff" stroke-width="1" stroke-linecap="round" opacity=".9" fill="none"/>
    <path d="M12.4 11.6 5 19" stroke="#6e7b8a" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M7.6 16.4 4.2 19.8a1.4 1.4 0 0 0 2 2l3.4-3.4Z" fill="#c2814b" stroke="#7d4f31" stroke-width="1.1" stroke-linejoin="round"/>`,
  snack: `<path d="M6.4 7.6h11.2l1.2 12.2c.1.8-.5 1.4-1.3 1.4H6.5c-.8 0-1.4-.6-1.3-1.4Z" fill="#f2d7a6" stroke="#a27a45" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M6.4 7.6 8 4.4h8l1.6 3.2" fill="#e6c38a" stroke="#a27a45" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M11.2 11.4c1.6.1 2.5 1.1 2.1 2.3l-3.4 4.6c-.3.4-.9.2-.9-.3l-.6-4.9c0-1.2 1.3-1.8 2.8-1.7Z" fill="url(#w-carrot)" stroke="#c45e17" stroke-width=".9"/>
    <path d="M12.8 11.2c.6-1 1.5-1.4 2.4-1.2-.4.8-1.2 1.2-2.2 1.4" fill="#6cc05a" stroke="#3f8c3a" stroke-width=".8"/>`,
  charm: `<circle cx="12" cy="13" r="8.2" fill="#fff6dc" stroke="#d1a43c" stroke-width="1.6"/>
    <circle cx="12" cy="13" r="6.2" fill="none" stroke="#f0cf73" stroke-width=".9"/>
    <g fill="#6cc05a" stroke="#3f8c3a" stroke-width=".8">
      <circle cx="12" cy="10.4" r="2.1"/><circle cx="14.6" cy="13" r="2.1"/><circle cx="12" cy="15.6" r="2.1"/><circle cx="9.4" cy="13" r="2.1"/>
    </g>
    <path d="M12 2.2v2.6" stroke="#d1a43c" stroke-width="1.6" stroke-linecap="round"/>`,
};

export function itemIcon(id: ItemId, cls = "ico"): string {
  return svg(ITEMS[id], "0 0 24 24", cls);
}

/** A seed packet with a tiny picture of what grows from it. */
export function seedIcon(plant: PlantId, cls = "ico"): string {
  const colors: Record<PlantId, [string, string]> = {
    carrot: ["#ffe2c2", "#ef7d24"],
    sunflower: ["#fff1b8", "#f2b01e"],
    clover: ["#e1f4d6", "#4ea64a"],
    blueberry: ["#e2e5ff", "#4a56c2"],
    lily: ["#ffe3ef", "#e47aa6"],
    moonflower: ["#ece6ff", "#8b78ee"],
  };
  const [paper, ink] = colors[plant];
  return svg(
    `<path d="M6 4.2h12l.8 15.4c0 .9-.6 1.6-1.5 1.6H6.7c-.9 0-1.5-.7-1.5-1.6Z" fill="${paper}" stroke="${ink}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M6 4.2 7.2 7h9.6L18 4.2" fill="none" stroke="${ink}" stroke-width="1" stroke-linejoin="round" opacity=".7"/>
    <circle cx="12" cy="13.4" r="3.6" fill="${ink}" opacity=".85"/>
    <circle cx="12" cy="13.4" r="1.4" fill="#fff" opacity=".85"/>`,
    "0 0 24 24",
    cls,
  );
}

/** Round portraits of the people met on expeditions. */
const NPCS: Record<NpcId, string> = {
  owl: `<circle cx="24" cy="24" r="22" fill="#f3e6d3"/>
    <path d="M12 18c0-6 5.4-10 12-10s12 4 12 10v12c0 7-5.4 11-12 11s-12-4-12-11Z" fill="#a8774f" stroke="#6e4a2e" stroke-width="1.4"/>
    <path d="M12.6 12.6 11 7l5.8 3.6M35.4 12.6 37 7l-5.8 3.6" fill="#a8774f" stroke="#6e4a2e" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M17 28c0 5 3 9 7 9s7-4 7-9c0-2-3-3.4-7-3.4S17 26 17 28Z" fill="#f0dcc0"/>
    <circle cx="18.6" cy="19.6" r="5.4" fill="#fff8ec" stroke="#6e4a2e" stroke-width="1.2"/>
    <circle cx="29.4" cy="19.6" r="5.4" fill="#fff8ec" stroke="#6e4a2e" stroke-width="1.2"/>
    <circle cx="19.2" cy="20" r="2.4" fill="#3a2b25"/><circle cx="28.8" cy="20" r="2.4" fill="#3a2b25"/>
    <circle cx="19.9" cy="19.2" r=".8" fill="#fff"/><circle cx="29.5" cy="19.2" r=".8" fill="#fff"/>
    <path d="M22.4 24.4h3.2L24 27.2Z" fill="#f2a43a" stroke="#c07a1c" stroke-width=".8" stroke-linejoin="round"/>
    <path d="M20 31.6l1.4 1.2M24 32.4v1.6M28 31.6l-1.4 1.2" stroke="#c9a57c" stroke-width="1" stroke-linecap="round"/>`,
  frog: `<circle cx="24" cy="24" r="22" fill="#e3f2dc"/>
    <ellipse cx="24" cy="29" rx="15" ry="11.4" fill="#79c167" stroke="#3f8c3a" stroke-width="1.4"/>
    <circle cx="16.4" cy="17.4" r="6" fill="#79c167" stroke="#3f8c3a" stroke-width="1.4"/>
    <circle cx="31.6" cy="17.4" r="6" fill="#79c167" stroke="#3f8c3a" stroke-width="1.4"/>
    <circle cx="16.4" cy="17.2" r="3.4" fill="#fff"/><circle cx="31.6" cy="17.2" r="3.4" fill="#fff"/>
    <circle cx="16.8" cy="17.6" r="2" fill="#3a2b25"/><circle cx="32" cy="17.6" r="2" fill="#3a2b25"/>
    <path d="M16 29.4c3.6 3.2 12.4 3.2 16 0" stroke="#2f6e2b" stroke-width="1.4" stroke-linecap="round" fill="none"/>
    <ellipse cx="24" cy="34.6" rx="8" ry="3.6" fill="#c9e8b6"/>
    <circle cx="13.6" cy="27" r="2" fill="#f2a0a8" opacity=".6"/><circle cx="34.4" cy="27" r="2" fill="#f2a0a8" opacity=".6"/>
    <path d="M14 11.6c2.6-2.4 7.4-2.2 9 .2M34 11.6c-2.6-2.4-7.4-2.2-9 .2" stroke="#8c6a4a" stroke-width="1.2" stroke-linecap="round" fill="none" opacity=".0"/>
    <rect x="19" y="5.2" width="10" height="3.2" rx="1.4" fill="#8a79e8"/><path d="M17 8.6h14" stroke="#6f5ad6" stroke-width="1.6" stroke-linecap="round"/>`,
  mole: `<circle cx="24" cy="24" r="22" fill="#ece3da"/>
    <ellipse cx="24" cy="29" rx="14.4" ry="12" fill="#6f625c" stroke="#463b36" stroke-width="1.4"/>
    <ellipse cx="24" cy="33" rx="7.4" ry="5.6" fill="#8b7d75"/>
    <ellipse cx="24" cy="28.4" rx="3" ry="2.2" fill="#f19aa8" stroke="#c46c7c" stroke-width=".9"/>
    <path d="M18.4 24.6c.8-.8 1.8-.8 2.6 0M27 24.6c.8-.8 1.8-.8 2.6 0" stroke="#2c2421" stroke-width="1.3" stroke-linecap="round" fill="none"/>
    <path d="M12.6 21.6c0-6 5-10.6 11.4-10.6s11.4 4.6 11.4 10.6Z" fill="#f2c14e" stroke="#b9862a" stroke-width="1.4" stroke-linejoin="round"/>
    <rect x="10.4" y="20.4" width="27.2" height="3" rx="1.5" fill="#d9a43a" stroke="#b9862a" stroke-width="1"/>
    <circle cx="24" cy="15.6" r="2.6" fill="#fff6c8" stroke="#b9862a" stroke-width="1"/>
    <path d="M15.4 36.6l-3.4 2.4M32.6 36.6l3.4 2.4" stroke="#f19aa8" stroke-width="2" stroke-linecap="round"/>`,
  firefly: `<circle cx="24" cy="24" r="22" fill="#2f2a52"/>
    <circle cx="24" cy="30" r="12" fill="url(#w-glow-warm)"/>
    <ellipse cx="17.6" cy="18" rx="6.4" ry="4.2" fill="#e8f1ff" opacity=".75" transform="rotate(-24 17.6 18)"/>
    <ellipse cx="30.4" cy="18" rx="6.4" ry="4.2" fill="#e8f1ff" opacity=".75" transform="rotate(24 30.4 18)"/>
    <ellipse cx="24" cy="30.6" rx="5.6" ry="6.4" fill="#ffe57a" stroke="#d9a62a" stroke-width="1.2"/>
    <circle cx="24" cy="20.4" r="5.8" fill="#4a3f6e" stroke="#2c2448" stroke-width="1.2"/>
    <circle cx="21.8" cy="20.2" r="1.6" fill="#fff"/><circle cx="26.2" cy="20.2" r="1.6" fill="#fff"/>
    <circle cx="22" cy="20.5" r=".8" fill="#2c2448"/><circle cx="26.4" cy="20.5" r=".8" fill="#2c2448"/>
    <path d="M21.6 15.2c-1-2.4-2.6-3.6-4.2-3.6M26.4 15.2c1-2.4 2.6-3.6 4.2-3.6" stroke="#9c92c8" stroke-width="1.1" stroke-linecap="round" fill="none"/>
    <circle cx="11" cy="31" r="1" fill="#ffe57a"/><circle cx="37" cy="12" r="1.1" fill="#ffe57a"/><circle cx="36" cy="35" r=".8" fill="#ffe57a"/>`,
  crow: `<circle cx="24" cy="24" r="22" fill="#e6e6f0"/>
    <path d="M11 28c0-9 5.8-16 13.4-16S37 19 37 28c0 6-5 10-13 10s-13-4-13-10Z" fill="#3c3a4c" stroke="#232230" stroke-width="1.4"/>
    <path d="M29.6 22.6 41 25.4l-11.2 3Z" fill="#f0b43c" stroke="#b9812a" stroke-width="1.1" stroke-linejoin="round"/>
    <circle cx="26.4" cy="21.4" r="3.6" fill="#fff"/>
    <circle cx="27" cy="21.6" r="1.9" fill="#232230"/><circle cx="27.6" cy="21" r=".6" fill="#fff"/>
    <circle cx="26.4" cy="21.4" r="5" fill="none" stroke="#d9b45a" stroke-width="1.2"/>
    <path d="M26.4 26.4c-.4 3-1.6 5-3.4 6" stroke="#d9b45a" stroke-width="1" fill="none"/>
    <path d="M15 25.6c3 3.4 7 5 11 5" stroke="#5a576e" stroke-width="1.4" stroke-linecap="round" fill="none"/>
    <path d="M18.6 12.4c1.4-3 3.6-4.4 6-4.2-1 1.4-1.4 2.8-1.2 4.4" fill="#3c3a4c" stroke="#232230" stroke-width="1.2" stroke-linejoin="round"/>`,
  hedgehog: `<circle cx="24" cy="24" r="22" fill="#f3e8da"/>
    <path d="M9 30c-1-3 0-6.4 1.8-8.8L8.6 17.6l4.6.6.4-4.8 3.8 2.6 1.6-4.6 3.2 3.6 2.6-4.2 2.2 4.4 3.8-2.8.8 4.8 4.4-1.2-1 4.6c1.6 2.4 2.4 5.2 1.8 8Z" fill="#8f6646" stroke="#5e412c" stroke-width="1.3" stroke-linejoin="round"/>
    <path d="M14 33c0-5.6 4.6-9.6 10-9.6s10 4 10 9.6c0 4-4.4 6.4-10 6.4S14 37 14 33Z" fill="#f2dcc0" stroke="#b58e66" stroke-width="1.2"/>
    <circle cx="20.4" cy="30" r="1.6" fill="#3a2b25"/><circle cx="27.6" cy="30" r="1.6" fill="#3a2b25"/>
    <circle cx="21" cy="29.5" r=".5" fill="#fff"/><circle cx="28.2" cy="29.5" r=".5" fill="#fff"/>
    <ellipse cx="24" cy="33.4" rx="1.8" ry="1.3" fill="#3a2b25"/>
    <circle cx="17.6" cy="33.4" r="1.8" fill="#f2a0a8" opacity=".6"/><circle cx="30.4" cy="33.4" r="1.8" fill="#f2a0a8" opacity=".6"/>
    <path d="M33.4 22.6c2.6-1.4 5.6-.6 6.4 1.8.8 2.4-.4 5-3 5.8" fill="#d0794f" stroke="#9a5233" stroke-width="1.2" stroke-linejoin="round"/>`,
};

export function npcPortrait(id: NpcId, cls = "portrait"): string {
  return svg(NPCS[id], "0 0 48 48", cls);
}

/** Small marks used in text: a sealed block, a settlement tick, a lock. */
export const MARKS = {
  block: svg(
    `<path d="M12 3 20 7.5v9L12 21l-8-4.5v-9Z" fill="#ffe7a0" stroke="#c9861a" stroke-width="1.2" stroke-linejoin="round"/><path d="M4 7.5 12 12l8-4.5M12 12v9" stroke="#c9861a" stroke-width="1.1" stroke-linejoin="round" fill="none"/><path d="M12 12 20 7.5v9L12 21Z" fill="#f2b23a" opacity=".55"/>`,
  ),
  lock: svg(
    `<rect x="5.5" y="10.5" width="13" height="10" rx="2.4" fill="#f4eee8" stroke="#8a7b70" stroke-width="1.3"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" fill="none" stroke="#8a7b70" stroke-width="1.6"/><circle cx="12" cy="15.2" r="1.6" fill="#8a7b70"/>`,
  ),
  check: svg(`<circle cx="12" cy="12" r="9" fill="#e7f6e1" stroke="#4ea64a" stroke-width="1.3"/><path d="m8 12.3 2.7 2.7L16.3 9.4" fill="none" stroke="#3f8c3a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`),
  moon: svg(`<path d="M15.6 3.6a8.6 8.6 0 1 0 4.8 13.2A7 7 0 0 1 15.6 3.6Z" fill="#d7ccff" stroke="#7c68e2" stroke-width="1.2" stroke-linejoin="round"/><circle cx="18.6" cy="5.6" r="1" fill="#b9a8ff"/>`),
  sun: svg(`<circle cx="12" cy="12" r="4.6" fill="#ffd25a" stroke="#e0a12a" stroke-width="1.2"/><path d="M12 2.6v2.6M12 18.8v2.6M2.6 12h2.6M18.8 12h2.6M5.4 5.4l1.8 1.8M16.8 16.8l1.8 1.8M5.4 18.6l1.8-1.8M16.8 7.2l1.8-1.8" stroke="#e0a12a" stroke-width="1.5" stroke-linecap="round"/>`),
  sword: svg(`<path d="M17.8 3.4 20.6 3.4 20.6 6.2 10.8 16 8 13.2Z" fill="#e3e8f0" stroke="#6e7b8a" stroke-width="1.1" stroke-linejoin="round"/><path d="M6.2 12.4l5.4 5.4M5.2 18.8l2.4-2.4" stroke="#a5683c" stroke-width="2" stroke-linecap="round"/>`),
  shield: svg(`<path d="M12 3 19 5.6v5.6c0 4.6-3 8-7 9.8-4-1.8-7-5.2-7-9.8V5.6Z" fill="#dfe9ff" stroke="#5a74c6" stroke-width="1.3" stroke-linejoin="round"/><path d="M12 6v12" stroke="#5a74c6" stroke-width="1" opacity=".5"/>`),
  heart: svg(`<path d="M12 20s-7.4-4.4-7.4-10a4.2 4.2 0 0 1 7.4-2.8A4.2 4.2 0 0 1 19.4 10c0 5.6-7.4 10-7.4 10Z" fill="#ffd3dc" stroke="#d76a84" stroke-width="1.3" stroke-linejoin="round"/>`),
  bag: svg(`<path d="M6 8.6h12l1 11c.1.9-.6 1.6-1.5 1.6h-11c-.9 0-1.6-.7-1.5-1.6Z" fill="#f2d7a6" stroke="#a27a45" stroke-width="1.2" stroke-linejoin="round"/><path d="M9 8.6V7a3 3 0 0 1 6 0v1.6" fill="none" stroke="#a27a45" stroke-width="1.4"/>`),
};
