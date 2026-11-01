import "./styles/pet.css";
import "./styles/hud.css";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Hud } from "./pet/hud";
import type { HudAction, HudState } from "./pet/hud-state";

// A second transparent window owns the cards, so none of their space limits
// where the actual pet window can be dragged.
const root = document.getElementById("hud")!;
const viewport = document.getElementById("hud-viewport")!;
const content = document.getElementById("hud-content")!;
const inTauri = "__TAURI_INTERNALS__" in window;
let zoom = 1;
let maxHeight = Infinity;
let measureFrame = 0;
let lastSize = "";
let lastRegions = "";
const seenToasts = new Map<number, number>();

function quietly(promise: Promise<unknown>) {
  promise.catch((error) => console.warn("[squeek-pet:hud]", error));
}

function shell(command: string, args?: Record<string, unknown>): Promise<unknown> {
  return inTauri ? invoke(command, args) : Promise.resolve();
}

function action(value: HudAction) {
  quietly(shell("hud_action", { action: value }));
  if (!inTauri && value.type === "close") {
    hud.setPanel(null, { pulse: "Squeek Pulse", settings: "Settings", close: "Close" });
    scheduleMeasure();
  }
}

const hud = new Hud(root, {
  closePanel: () => action({ type: "close" }),
  openSettings: () => action({ type: "settings" }),
  openUrl: (url) => action({ type: "url", url }),
});

/** The shell needs window-relative, clipped hit regions after zoom or scroll. */
function updateHitRegions() {
  const bounds = viewport.getBoundingClientRect();
  const rawRects = hud.interactiveRects();
  const scrollable = hud.panelOpen && content.offsetHeight > viewport.clientHeight;
  viewport.dataset.scrollable = String(scrollable);
  if (scrollable) rawRects.push(bounds);
  const rects = rawRects.flatMap((rect) => {
    const x = Math.max(0, bounds.left, rect.left);
    const y = Math.max(0, bounds.top, rect.top);
    const right = Math.min(window.innerWidth, bounds.right, rect.right);
    const bottom = Math.min(window.innerHeight, bounds.bottom, rect.bottom);
    return right > x && bottom > y ? [{ x, y, w: right - x, h: bottom - y }] : [];
  });
  const key = JSON.stringify(rects);
  if (key !== lastRegions) {
    lastRegions = key;
    quietly(shell("set_hit_regions", { rects }));
  }
}

function measure() {
  measureFrame = 0;
  const stack = root.querySelector<HTMLElement>(".hud-stack")!;
  const emptyStack = !stack.querySelector(".bubble:not([hidden]), .toast");
  if (stack.hidden !== emptyStack) stack.hidden = emptyStack;
  const visible = Boolean(root.querySelector(".bubble:not([hidden]), .panel:not([hidden]), .toast"));
  // Measure the unconstrained inner content, not the scrolling viewport. The
  // shell can clamp a tall panel without turning that clamp into a new request.
  const width = Math.ceil(300 * zoom);
  const height = visible ? Math.ceil(root.getBoundingClientRect().height) : 0;
  content.style.width = `${width}px`;
  content.style.height = `${height}px`;
  viewport.style.width = `${width}px`;
  viewport.style.height = `${Math.min(height, maxHeight)}px`;
  const key = `${width}:${height}`;
  if (key !== lastSize) {
    lastSize = key;
    quietly(shell("resize_hud", { width, height }));
  }
  updateHitRegions();
}

function scheduleMeasure() {
  if (!measureFrame) measureFrame = requestAnimationFrame(measure);
}

function render(state: HudState) {
  zoom = Number.isFinite(state.zoom) ? Math.min(1.5, Math.max(0.4, state.zoom)) : 1;
  root.style.transform = `scale(${zoom})`;
  hud.setBubble(state.bubble);
  hud.setPanel(state.panel, state.labels);
  const now = Date.now();
  for (const [id, at] of seenToasts) {
    if (now - at > 60_000) seenToasts.delete(id);
  }
  for (const toast of state.toasts) {
    if (seenToasts.has(toast.id)) continue;
    seenToasts.set(toast.id, toast.at);
    const lifetime = toast.content.action ? 6500 : 3800;
    const remaining = lifetime - Math.max(0, now - toast.at);
    if (remaining <= 0) continue;
    hud.toast(toast.content);
    // Replaying a cached state after the HUD loads must not extend a toast's
    // lifetime. Existing Hud timers are harmless after this node is removed.
    const toasts = root.querySelectorAll<HTMLElement>(".toast");
    const node = toasts[toasts.length - 1];
    window.setTimeout(() => {
      node.classList.add("toast--leaving");
      window.setTimeout(() => node.remove(), 300);
    }, remaining);
  }
  scheduleMeasure();
}

new ResizeObserver(scheduleMeasure).observe(root);
new MutationObserver(scheduleMeasure).observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "class"] });
viewport.addEventListener("scroll", updateHitRegions, { passive: true });
window.addEventListener("resize", scheduleMeasure);
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") action({ type: "close" });
});

async function start() {
  if (!inTauri) {
    preview();
    return;
  }
  await listen<HudState>("pet://hud-state", ({ payload }) => render(payload));
  await listen<{ side: "above" | "below"; maxHeight: number }>("pet://hud-placement", ({ payload }) => {
    document.body.dataset.side = payload.side;
    maxHeight = Math.max(0, payload.maxHeight);
    scheduleMeasure();
  });
  await invoke("hud_ready");
  scheduleMeasure();
}

/** Explicit local visual QA page. It does not fetch data or run in Tauri. */
function preview() {
  const params = new URLSearchParams(location.search);
  const mode = params.get("preview");
  if (mode !== "bubble" && mode !== "panel") return;
  document.body.classList.add("hud-preview");
  document.body.dataset.side = params.get("side") === "below" ? "below" : "above";
  const limit = Number(params.get("maxHeight"));
  maxHeight = limit > 0 && Number.isFinite(limit) ? limit : window.innerHeight;
  const requestedZoom = Number(params.get("zoom"));
  const rows = [
    { label: "Today", value: "0 m" },
    { label: "Work", value: "+0 since launch" },
    { label: "Sync", value: "5s ago" },
  ];
  render({
    bubble: mode === "bubble" ? {
      title: "Squeektoshi",
      badge: { text: "PREVIEW", tone: "label" },
      status: "Zzz… the wheel is still",
      rows,
      note: "Resting animation. The API only says the wheel is idle.",
      foot: "Layout preview · no live data",
    } : null,
    panel: mode === "panel" ? {
      title: "Squeektoshi",
      badge: { text: "PREVIEW", tone: "label" },
      rows: [...rows, ...rows, ...rows],
      reading: "Preview reading only",
      tx: null,
      source: "Layout preview · no live data",
    } : null,
    labels: { pulse: "Squeek Pulse", settings: "Settings", close: "Close" },
    zoom: requestedZoom > 0 && Number.isFinite(requestedZoom) ? requestedZoom : 0.8,
    toasts: [],
  });
}

quietly(start());
