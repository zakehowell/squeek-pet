import { gridOf, pixelArt, readyPixelArt } from "../pixel";

// Small DOM helpers for the World page. Text always goes in as text nodes;
// only our own static SVG drawings (see ../art) are inserted as markup.

export type Child = Node | string | number | null | undefined | false;
type Handler = (event: Event) => void;
export type Attrs = Record<string, string | number | boolean | null | undefined | Handler>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === null || value === undefined || value === false) continue;
      if (typeof value === "function") node.addEventListener(key.slice(2), value);
      else if (key === "class") node.className = String(value);
      else if (value === true) node.setAttribute(key, "");
      else node.setAttribute(key, String(value));
    }
  }
  append(node, children);
  return node;
}

export function append(node: Node, children: readonly Child[]) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(typeof child === "string" || typeof child === "number" ? document.createTextNode(String(child)) : child);
  }
}

// ---- Keyboard focus across redraws ----------------------------------------------
//
// Every redraw replaces the World's controls, which would drop keyboard focus
// on the page body. A spot remembers where the focused control sat and what it
// said, so the redraw can put focus on its replacement.

export interface FocusSpot {
  /** Which of the redrawn regions held the control. */
  region: number;
  /** Child indexes from the region down to the control. */
  path: number[];
  label: string;
}

const FOCUSABLE = "button, a[href], summary, textarea, input, select, [tabindex]";
const labelOf = (el: Element) => `${el.tagName}|${el.getAttribute("aria-label") ?? el.textContent?.trim() ?? ""}`;

export function focusSpot(root: DocumentOrShadowRoot, regions: readonly Element[]): FocusSpot | null {
  const el = root.activeElement;
  if (!el) return null;
  const region = regions.findIndex((r) => r !== el && r.contains(el));
  if (region < 0) return null;
  const path: number[] = [];
  for (let node: Element = el; node !== regions[region] && node.parentElement; node = node.parentElement) {
    path.unshift(Array.prototype.indexOf.call(node.parentElement.children, node));
  }
  return { region, path, label: labelOf(el) };
}

/**
 * After a redraw that lost focus: focus the control at the same place with the
 * same label. If it changed (Build became Upgrade) or went away, focus what
 * held it instead, so pressing the same key again never does something new.
 */
export function restoreFocus(root: DocumentOrShadowRoot, regions: readonly Element[], spot: FocusSpot) {
  if (root.activeElement) return;
  const region = regions[spot.region];
  if (!region?.isConnected) return;
  let node: Element = region;
  let depth = 0;
  for (const index of spot.path) {
    const next = node.children[index];
    if (!next) break;
    node = next;
    depth++;
  }
  const same = depth === spot.path.length && labelOf(node) === spot.label && node.matches(FOCUSABLE);
  const target = (same ? node : depth === spot.path.length ? (node.parentElement ?? region) : node) as HTMLElement;
  if (!same && !target.matches(FOCUSABLE)) target.tabIndex = -1;
  target.focus({ preventScroll: true });
}

/** The option arrow keys (and Home and End) move to in a row of tabs, or null for other keys. */
export function arrowStep<T>(key: string, options: readonly T[], current: T): T | null {
  const i = Math.max(0, options.indexOf(current));
  const n = options.length;
  if (!n) return null;
  if (key === "ArrowLeft" || key === "ArrowUp") return options[(i - 1 + n) % n];
  if (key === "ArrowRight" || key === "ArrowDown") return options[(i + 1) % n];
  if (key === "Home") return options[0];
  if (key === "End") return options[n - 1];
  return null;
}

let defs = "";

/** The gradients the drawings refer to (the inside of their <defs>), for making pixel art. */
export function setArtDefs(inner: string) {
  defs = inner;
}

const OWN_CLASS = /^<svg class="([^"]*)"/;

/**
 * One of our own drawings, as pixel art (see ../pixel) or, where the browser
 * can't make that, as the vector drawing. Never pass markup built from data
 * read from outside.
 */
export function art(markup: string, cls = "art"): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = cls;
  const grid = gridOf(markup);
  const ready = readyPixelArt(markup);
  if (!grid || ready === null) {
    span.innerHTML = markup;
    return span;
  }
  const img = document.createElement("img");
  img.className = `px ${OWN_CLASS.exec(markup)?.[1] ?? ""}`.trim();
  img.alt = "";
  img.width = Math.round(grid.width * grid.scale);
  img.height = Math.round(grid.height * grid.scale);
  img.draggable = false;
  span.append(img);
  if (ready) img.src = ready;
  else
    void pixelArt(markup, defs).then((url) => {
      if (url) img.src = url;
      else span.innerHTML = markup;
    });
  return span;
}
