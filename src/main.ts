import "./styles/scene.css";
import "./styles/pet.css";
import { SceneView, toScene, type Frame } from "./art/rig";
import { ANCHOR, HULL } from "./art/hamster";
import { NEST, SCENE_HEIGHT, SCENE_WIDTH, WHEEL } from "./art/scene";
import { createStatusClient } from "./core/api";
import { createLiveLink } from "./core/live";
import { demoSnapshot } from "./core/demo";
import { t, type MessageKey } from "./core/i18n";
import { PetMachine, type Effect, type MachineConfig } from "./core/pet-machine";
import { createPoller } from "./core/poller";
import { PERFORMANCE, SCALE_PRESETS, loadSettings, petLayout, sanitize, saveSettings, type Settings } from "./core/settings";
import { Director, idleInput } from "./pet/director";
import { Hud } from "./pet/hud";
import { DesktopHud } from "./pet/desktop-hud";
import { LiveButton } from "./pet/live-button";
import { mountPlayDock } from "./pet/play-dock";
import { PULSE_URL, WORLD_URL, bubbleContent, offersLiveStream, panelContent, petLabel, toastContent } from "./pet/present";
import { desktop, inTauri, type HitRect, type MenuItems } from "./platform/desktop";
import { Sounds } from "./sound";

// The pet window: polls the wheel, runs the state machine, draws the frame.

const params = new URLSearchParams(location.search);
let settings = loadSettings();
if (params.has("demo")) settings = { ...settings, demo: params.get("demo") !== "0" };
if (params.get("lang") === "en" || params.get("lang") === "zh") settings = { ...settings, language: params.get("lang") as Settings["language"] };

const root = document.getElementById("pet")!;
const stage = document.getElementById("stage")!;
const view = new SceneView(stage);
const sounds = new Sounds();
sounds.enabled = settings.sounds;
const input = idleInput();
const tr = (key: MessageKey, values?: Record<string, string>) => t(settings.language, key, values);

const machineConfig = (): MachineConfig => ({ unitsPerBean: BigInt(settings.unitsPerBean), maxPile: 12 });
let machine = new PetMachine(Date.now(), machineConfig());
let director = new Director(Date.now());
let lastFrame: Frame | null = null;
let panelOpen = false;

const HudView = inTauri ? DesktopHud : Hud;
const hud = new HudView(root, {
  openUrl: (url) => desktop.openUrl(url),
  openSettings: () => desktop.openSettings(),
  closePanel: () => setPanel(false),
});

// While the real hamster runs, hovering him offers @squeekchain's X stream.
const liveLink = createLiveLink();
const liveButton = new LiveButton(root, () => desktop.openUrl(liveLink.url()));

// ---- Data: the live API, or the clearly labelled demo loop -----------------

function handle(effects: Effect[]) {
  for (const effect of effects) {
    if (effect.type === "sound") sounds.play(effect.name);
    else if (settings.toasts) hud.toast(toastContent(effect, machine.state, settings.language));
  }
}

const poller = createPoller({
  client: createStatusClient(),
  intervalMs: () => PERFORMANCE[settings.performance].pollMs,
  onResult(outcome, at) {
    if (settings.demo) return;
    handle(
      machine.dispatch(
        outcome.ok ? { type: "snapshot", snapshot: outcome.snapshot, at } : { type: "failure", failure: outcome.failure, at },
      ),
    );
  },
});

let demoTimer: number | null = null;

/** Live and demo data never share a machine, so demo work can never reach live totals. */
function startSource() {
  poller.stop();
  if (demoTimer !== null) window.clearInterval(demoTimer);
  demoTimer = null;
  const now = Date.now();
  machine = new PetMachine(now, machineConfig());
  director = new Director(now);
  if (settings.demo) {
    const startedAt = now;
    const feed = () => {
      const at = Date.now();
      handle(machine.dispatch({ type: "snapshot", snapshot: demoSnapshot(startedAt, at), at }));
    };
    feed();
    demoTimer = window.setInterval(feed, 1000);
  } else {
    poller.start();
  }
}

// ---- Settings ---------------------------------------------------------------

let sizeFrame = 0;

/**
 * The desktop window wraps only the scene; cards have a separate window so
 * reserving room for them never prevents dragging the pet to a screen edge.
 * A slider drag sends many changes; they are coalesced to one resize per frame.
 */
function applySize(immediately = false) {
  const apply = () => {
    sizeFrame = 0;
    const layout = petLayout(settings.scale);
    root.style.transform = `scale(${layout.zoom})`;
    root.style.setProperty("--stage", String(layout.stage));
    if (hud instanceof DesktopHud) hud.setZoom(layout.zoom);
    desktop.resizePet(layout.width, Math.ceil(SCENE_HEIGHT * layout.stage * layout.zoom));
  };
  if (immediately) apply();
  else if (!sizeFrame) sizeFrame = requestAnimationFrame(apply);
}

function updateTray() {
  desktop.setTrayLabels({
    toggle: tr("tray.toggle"),
    details: tr("menu.details"),
    world: tr("menu.world"),
    demo: tr("menu.demo"),
    settings: tr("menu.settings"),
    quit: tr("menu.quit"),
    demoOn: settings.demo,
  });
}

function applySettings(next: Settings, origin: "here" | "elsewhere") {
  const prev = settings;
  settings = next;
  if (origin === "here") {
    saveSettings(next);
    desktop.broadcastSettings(next);
  }
  sounds.enabled = next.sounds;
  if (prev.scale !== next.scale) applySize();
  if (prev.alwaysOnTop !== next.alwaysOnTop) desktop.setAlwaysOnTop(next.alwaysOnTop);
  if (prev.unitsPerBean !== next.unitsPerBean) machine.setConfig(machineConfig());
  if (prev.performance !== next.performance) poller.pollSoon();
  if (prev.demo !== next.demo) startSource();
  if (prev.language !== next.language || prev.demo !== next.demo) updateTray();
  document.documentElement.lang = next.language === "zh" ? "zh-CN" : "en";
}

const change = (patch: Partial<Settings>) => applySettings(sanitize({ ...settings, ...patch }), "here");

desktop.onSettings((raw) => {
  if (raw && typeof raw === "object") applySettings(sanitize(raw), "elsewhere");
});
desktop.onTrayAction((action) => {
  if (action === "details") setPanel(true);
  if (action === "world") desktop.openUrl(WORLD_URL);
  if (action === "demo") change({ demo: !settings.demo });
});

// ---- Pointer: hover, eye tracking, pats, clicks, drag, menus ----------------

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const inside = (b: Box, x: number, y: number) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
let petBoxes: Box[] = [];
let hoverSince = -Infinity;
let leftAt = -Infinity;
let cursor: { x: number; y: number } | null = null;

/** Cursor moved, in window coordinates (from the desktop shell or the DOM). */
function pointerAt(x: number, y: number) {
  const now = performance.now();
  cursor = { x, y };
  const over = petBoxes.some((b) => inside(b, x, y));
  if (over && !input.hover) hoverSince = now;
  if (!over && input.hover) leftAt = now;
  input.hover = over;
  const svg = view.svg.getBoundingClientRect();
  const k = SCENE_WIDTH / svg.width;
  input.cursor = { x: (x - svg.left) * k, y: (y - svg.top) * k };
  trackPat(x, now);
}

function pointerGone() {
  if (input.hover) leftAt = performance.now();
  input.hover = false;
  input.cursor = null;
  cursor = null;
}

// A pat is the pointer rubbing back and forth over the head.
let patDir = 0;
let patX = 0;
let patTurns: number[] = [];
function trackPat(x: number, now: number) {
  if (!lastFrame || pressed || !input.cursor) return;
  const head = toScene(lastFrame.pose, ...ANCHOR.head);
  const near = Math.hypot(input.cursor.x - head.x, input.cursor.y - head.y) < 26;
  if (!near) {
    patTurns = [];
    return;
  }
  const dx = x - patX;
  patX = x;
  if (Math.abs(dx) < 1.5) return;
  const dir = Math.sign(dx);
  if (patDir && dir !== patDir) patTurns.push(now);
  patDir = dir;
  patTurns = patTurns.filter((at) => now - at < 1200);
  if (patTurns.length >= 4 && Date.now() - input.patAt > 1500) {
    input.patAt = Date.now();
    patTurns = [];
  }
}

desktop.onCursor((e) => pointerAt(e.x, e.y));
if (!inTauri) {
  window.addEventListener("pointermove", (e) => pointerAt(e.clientX, e.clientY));
  document.addEventListener("pointerleave", pointerGone);
}

let pressed: { x: number; y: number } | null = null;
let clicks: number[] = [];

stage.addEventListener("pointerdown", (e) => {
  if (e.button !== 0 || !petBoxes.some((b) => inside(b, e.clientX, e.clientY))) return;
  sounds.unlock();
  pressed = { x: e.clientX, y: e.clientY };
});

window.addEventListener("pointermove", (e) => {
  if (!pressed || !(e.buttons & 1)) return;
  if (Math.hypot(e.clientX - pressed.x, e.clientY - pressed.y) > 4) {
    pressed = null;
    desktop.startDrag();
  }
});

window.addEventListener("pointerup", () => {
  if (!pressed) return;
  pressed = null;
  const now = Date.now();
  input.clickAt = now;
  sounds.play("squeek");
  clicks = [...clicks.filter((at) => now - at < 1600), now];
  if (clicks.length >= 4) {
    input.grumpyAt = now;
    clicks = [];
  }
});

stage.addEventListener("dblclick", (e) => {
  if (petBoxes.some((b) => inside(b, e.clientX, e.clientY))) setPanel(!panelOpen);
});

stage.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  if (!petBoxes.some((b) => inside(b, e.clientX, e.clientY))) return;
  void desktop.popupMenu(contextMenu());
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") setPanel(false);
});

function contextMenu(): MenuItems {
  const size = (scale: number) => ({
    text: `${scale}%`,
    checked: settings.scale === scale,
    action: () => change({ scale }),
  });
  return [
    { text: tr("menu.details"), action: () => setPanel(true) },
    { text: tr("menu.world"), action: () => desktop.openUrl(WORLD_URL) },
    {
      text: tr("menu.size"),
      items: [...SCALE_PRESETS.map(size), { item: "Separator" }, { text: tr("menu.sizeCustom"), action: () => desktop.openSettings() }],
    },
    { item: "Separator" },
    { text: tr("menu.sounds"), checked: settings.sounds, action: () => change({ sounds: !settings.sounds }) },
    { text: tr("menu.demo"), checked: settings.demo, action: () => change({ demo: !settings.demo }) },
    { item: "Separator" },
    { text: tr("menu.pulse"), action: () => desktop.openUrl(PULSE_URL) },
    { text: tr("menu.settings"), action: () => desktop.openSettings() },
    { item: "Separator" },
    { text: tr("menu.hide"), action: () => desktop.hidePet() },
    { text: tr("menu.quit"), action: () => desktop.quit() },
  ];
}

function setPanel(open: boolean) {
  panelOpen = open;
  refreshHud(Date.now(), true);
}

// ---- Browser play dock ------------------------------------------------------

function playPat() {
  sounds.unlock();
  input.patAt = Date.now();
  sounds.play("squeek");
}

function playFeed() {
  sounds.unlock();
  if (machine.state.mode === "running" || machine.state.mode === "waking") {
    hud.toast({ text: tr("play.busy"), tone: "plain", action: null });
    return;
  }
  input.treatAt = Date.now();
  sounds.play("nom");
}

function playWake() {
  const now = Date.now();
  sounds.unlock();
  input.wakeAt = now;
  if (machine.state.mode === "sleeping" || machine.state.mode === "loading") {
    sounds.play("squeek");
  } else {
    hud.toast({ text: tr("play.awake"), tone: "plain", action: null });
    poller.pollSoon();
  }
}

function mountBrowserChrome() {
  document.body.classList.add("web");

  const backdrop = document.createElement("div");
  backdrop.className = "web-backdrop";
  backdrop.setAttribute("aria-hidden", "true");

  const head = document.createElement("header");
  head.className = "web-head";
  const title = document.createElement("h1");
  title.textContent = "Squeek Pet";
  const subtitle = document.createElement("p");
  subtitle.textContent = tr("web.subtitle");
  head.append(title, subtitle);

  const dock = mountPlayDock(
    {
      label: tr("play.label"),
      pat: tr("play.pat"),
      feed: tr("play.feed"),
      wake: tr("play.wake"),
      hint: tr("web.hint"),
    },
    { pat: playPat, feed: playFeed, wake: playWake },
  );

  document.body.append(backdrop, head, dock);

  window.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
    const key = e.key.toLowerCase();
    if (key === "p") playPat();
    else if (key === "f") playFeed();
    else if (key === "w") playWake();
  });
}

// ---- Frame loop -------------------------------------------------------------

let hudAt = 0;
let bubbleShown = false;
function refreshHud(now: number, force = false) {
  const clock = performance.now();
  const hovering = input.hover && clock - hoverSince > 250;
  const leftFor = !input.hover && leftAt > hoverSince ? clock - leftAt : Infinity;
  const showBubble = !panelOpen && (hovering || leftFor < 400);
  // The pill waits a little longer, so the pointer can travel from the
  // hamster to it across the gap beside the wheel.
  const showLive = !panelOpen && offersLiveStream(machine.state) && (hovering || leftFor < 900);
  // Text refreshes twice a second; showing or hiding the bubble happens at once.
  if (!force && now - hudAt < 500 && showBubble === bubbleShown && showLive === liveButton.visible) return;
  hudAt = now;
  bubbleShown = showBubble;
  const lang = settings.language;
  const state = machine.state;
  if (showLive && !liveButton.visible) void liveLink.refresh();
  liveButton.setLabels({ text: tr("live.watch"), title: tr("live.title") });
  liveButton.setVisible(showLive);
  hud.setTag(petLabel(state, lang));
  hud.setPanel(panelOpen ? panelContent(state, now, lang) : null, {
    pulse: tr("panel.openPulse"),
    settings: tr("panel.settings"),
    close: tr("panel.close"),
  });
  hud.setBubble(showBubble ? bubbleContent(state, now, lang) : null);
}

let regionsKey = "";
let regionsAt = 0;
function updateHitRegions(frame: Frame, now: number) {
  if (now - regionsAt < 100) return;
  regionsAt = now;
  const svg = view.svg.getBoundingClientRect();
  const k = svg.width / SCENE_WIDTH;
  const box = (x: number, y: number, w: number, h: number): Box => ({ x: svg.left + x * k, y: svg.top + y * k, w: w * k, h: h * k });
  const hull = HULL.map(([x, y]) => toScene(frame.pose, x, y));
  const left = Math.min(...hull.map((q) => q.x));
  const right = Math.max(...hull.map((q) => q.x));
  const high = Math.min(...hull.map((q) => q.y));
  const low = Math.max(...hull.map((q) => q.y));
  const top = WHEEL.cy - WHEEL.rim - 4;
  petBoxes = [
    box(WHEEL.cx - WHEEL.rim - 4, top, WHEEL.rim * 2 + 8, 210 - top),
    box(154, 182, NEST.x + 46 - 154, 30),
    box(left - 6, high - 6, right - left + 12, low - high + 12),
  ];
  // While it shows, the live pill counts as part of the pet: hovering it
  // keeps it open, and the desktop shell lets its clicks through to it.
  const live = liveButton.rect();
  if (live) petBoxes.push({ x: live.x, y: live.y, w: live.width, h: live.height });
  const rects: HitRect[] = [...petBoxes, ...hud.interactiveRects().map((r) => ({ x: r.x, y: r.y, w: r.width, h: r.height }))].map((r) => ({
    x: Math.floor(r.x),
    y: Math.floor(r.y),
    w: Math.ceil(r.w),
    h: Math.ceil(r.h),
  }));
  const key = JSON.stringify(rects);
  if (key !== regionsKey) {
    regionsKey = key;
    desktop.setHitRegions(rects);
  }
  if (cursor && inTauri) pointerAt(cursor.x, cursor.y);
}

/** Calm states draw at a lower rate to save battery; motion gets the full rate. */
function frameRate(): number {
  const fps = PERFORMANCE[settings.performance].fps;
  const state = machine.state;
  const calm = (state.mode === "sleeping" || state.mode === "offline") && !input.hover && !state.celebration && !panelOpen;
  return calm ? Math.min(fps, 12) : fps;
}

let drawnAt = 0;
function loop(ts: number) {
  requestAnimationFrame(loop);
  const fps = frameRate();
  if (ts - drawnAt < 1000 / fps - 2) return;
  drawnAt = ts;
  const now = Date.now();
  handle(machine.dispatch({ type: "tick", at: now }));
  lastFrame = director.frame(machine.state, now, input, fps);
  view.apply(lastFrame);
  refreshHud(now);
  updateHitRegions(lastFrame, ts);
}

// Keeps the state machine moving while the window is hidden and frames pause.
window.setInterval(() => {
  if (document.hidden) handle(machine.dispatch({ type: "tick", at: Date.now() }));
}, 1000);

// ---- Start ------------------------------------------------------------------

document.documentElement.lang = settings.language === "zh" ? "zh-CN" : "en";
if (inTauri) document.body.classList.add("desktop");
applySize(true);
desktop.setAlwaysOnTop(settings.alwaysOnTop);
updateTray();
startSource();
if (!inTauri) mountBrowserChrome();
requestAnimationFrame(loop);

// Hooks for automated screenshots in a plain browser.
if (!inTauri) {
  Object.assign(window, {
    __squeekPet: {
      get state() {
        return machine.state;
      },
      get frame() {
        return lastFrame;
      },
      get input() {
        return input;
      },
      hover(x: number, y: number) {
        pointerAt(x, y);
      },
      panel: setPanel,
      change,
      play: { pat: playPat, feed: playFeed, wake: playWake },
    },
  });
}
