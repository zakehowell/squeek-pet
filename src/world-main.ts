import "./styles/scene.css";
import "./styles/world.css";
import { SceneView } from "./art/rig";
import { createStatusClient } from "./core/api";
import { formatAgo, formatRpm } from "./core/format";
import { PetMachine } from "./core/pet-machine";
import { createPoller } from "./core/poller";
import { PERFORMANCE, loadSettings, sanitize, saveSettings, type Settings } from "./core/settings";
import { Director, idleInput } from "./pet/director";
import { desktop, inTauri } from "./platform/desktop";
import { artDefs, itemIcon, MARKS, resIcon, seedIcon } from "./world/art/icons";
import { worldDefs } from "./world/art/world-art";
import { backfilling, communityCap, milestoneCap, refreshCommunity, sharedBoss, simulatedBoss } from "./world/boss";
import { BEANS_PER_WORK, CONSUMABLES, GEAR, ITEMS, PLANTS, PLANT_ORDER, RESOURCES } from "./world/data";
import { check, chestTier, currentSeason } from "./world/engine";
import { BusyError, defaultFetch, readDays, type CommunityRead, type WorkBucket } from "./world/feed";
import { errorText, num, renderLine, resourceName, ui, type UiKey } from "./world/i18n";
import { addSimDay, addSimTurns, loadSim, resetSim } from "./world/sim";
import { exportSave, importSave, loadSave, SAVE_KEYS, worldOf, writeSave, type SaveFile, type WorldKind } from "./world/store";
import { FeedError } from "./world/ledger";
import { bossOf } from "./world/season";
import { pull, recordChoice } from "./world/sync";
import type { Choice, WorldState } from "./world/types";
import { adventureView } from "./world/ui/adventure";
import { art, h } from "./world/ui/dom";
import { guildView } from "./world/ui/guild";
import { homeView } from "./world/ui/home";
import { logView } from "./world/ui/log";
import { card, hint, plainButton, segmented, type BossRead, type Tab, type UiState, type View } from "./world/ui/parts";

// The Squeek Pet World window (and the same page in a browser): the real
// world built from settled SqueekCore turns, or the clearly labelled trial
// world, with the live hamster on the side.

const SYNC_MS = 120_000;
const BOSS_MS = 600_000;
const MODE_KEY = "squeek-world:mode";
const TAB_KEY = "squeek-world:tab";
const DEFEATED_KEY = "squeek-world:defeated";
const TABS: readonly Tab[] = ["home", "adventure", "log", "guild"];

const params = new URLSearchParams(location.search);
let settings = loadSettings();
if (params.get("lang") === "en" || params.get("lang") === "zh") settings = { ...settings, language: params.get("lang") as Settings["language"] };

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private windows may refuse storage; the page still works for this visit.
  }
}

let kind: WorldKind = params.get("mode") === "trial" || (params.get("mode") !== "real" && stored(MODE_KEY) === "sim") ? "sim" : "real";
const savedTab = (params.get("tab") ?? stored(TAB_KEY)) as Tab | null;
const uiState: UiState = { tab: savedTab && TABS.includes(savedTab) ? savedTab : "home", picking: null, route: null, gear: [], snack: false, charm: false, logShown: 0 };

let save: SaveFile | null = null;
let world: WorldState | null = null;

type SyncState = "idle" | "syncing" | "founding" | "busy" | "error";
let syncState: SyncState = "idle";
let syncedAt: number | null = null;
let reorgNote = false;
let syncTimer: number | null = null;
let syncing = false;

let days: WorkBucket[] | null = null;
let players: CommunityRead | null = null;
let milestones: CommunityRead | null = null;
let bossFailed = false;
let bossReadAt = 0;
let bossTimer: number | null = null;

const tr = (key: UiKey, values?: Record<string, string | number>) => ui(settings.language, key, values);

// ---- Page skeleton --------------------------------------------------------------

const root = document.getElementById("world")!;
const defs = h("div", { class: "defs" });
defs.innerHTML = worldDefs() + artDefs();
const headerEl = h("header", { class: "top" });
const liveStage = h("div", { class: "live-stage" });
const liveLine = h("p", { class: "live-line" });
const liveCard = h("section", { class: "card live" }, h("h2", null), liveStage, liveLine, h("p", { class: "hint live-note" }));
const syncEl = h("div", { class: "side-sync" });
const bagEl = h("div", { class: "side-bag" });
const helpEl = h("div", { class: "side-help" });
const tabsEl = h("nav", { class: "tabs", role: "tablist" });
const panelEl = h("div", { class: "panel", role: "tabpanel" });
const toastsEl = h("div", { class: "toasts", "aria-live": "polite" });
root.append(
  defs,
  headerEl,
  h("div", { class: "layout" }, h("aside", { class: "side" }, liveCard, syncEl, bagEl, helpEl), h("div", { class: "content" }, tabsEl, panelEl)),
  toastsEl,
);

// ---- Toasts and dialogs ----------------------------------------------------------

function toast(text: string, tone: "ok" | "warn" | "news" = "ok") {
  const node = h("div", { class: `toast ${tone}` }, text);
  toastsEl.append(node);
  while (toastsEl.children.length > 4) toastsEl.firstElementChild?.remove();
  window.setTimeout(() => node.classList.add("out"), tone === "news" ? 6500 : 3200);
  window.setTimeout(() => node.remove(), tone === "news" ? 7000 : 3700);
}

/** An in-page confirm: native dialogs are not available in every desktop webview. */
function ask(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const done = (answer: boolean) => {
      overlay.remove();
      resolve(answer);
    };
    const ok = plainButton(tr("confirm.ok"), () => done(true), "btn primary");
    const overlay = h(
      "div",
      { class: "overlay", role: "dialog", "aria-modal": "true" },
      h("div", { class: "dialog" }, h("p", null, message), h("div", { class: "dialog-actions" }, plainButton(tr("confirm.cancel"), () => done(false), "btn"), ok)),
    );
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") done(false);
    });
    document.body.append(overlay);
    ok.focus();
  });
}

function saveDialog(mode: "export" | "import") {
  const text = h("textarea", { class: "save-text", spellcheck: "false", rows: 10 });
  const close = () => overlay.remove();
  const actions = h("div", { class: "dialog-actions" }, plainButton(tr("save.close"), close, "btn"));
  if (mode === "export" && save) {
    text.value = exportSave(save);
    text.readOnly = true;
    const copy = plainButton(tr("save.copy"), () => {
      text.select();
      void navigator.clipboard?.writeText(text.value).then(
        () => toast(tr("save.copied")),
        () => document.execCommand("copy"),
      );
    }, "btn primary");
    actions.append(copy);
  } else {
    const load = plainButton(tr("save.load"), () => {
      const imported = importSave(text.value, kind);
      if (!imported) {
        toast(tr("save.badImport"), "warn");
        return;
      }
      writeSave(imported);
      close();
      reload();
      toast(tr("save.imported"));
    }, "btn primary");
    actions.append(load);
  }
  const note = mode === "export" ? tr("save.exportNote") : tr("save.importNote", { world: tr(kind === "real" ? "mode.real" : "mode.sim") });
  const overlay = h("div", { class: "overlay", role: "dialog", "aria-modal": "true" }, h("div", { class: "dialog wide" }, h("h2", null, tr(mode === "export" ? "save.export" : "save.import")), h("p", { class: "hint" }, note), text, actions));
  document.body.append(overlay);
  text.focus();
}

// ---- The world ---------------------------------------------------------------------

function reload() {
  save = kind === "sim" ? loadSim() : loadSave("real");
  world = save ? worldOf(save) : null;
  render();
}

/** Toasts what the newly applied turns brought, newest last. */
function announce(before: WorldState | null, after: WorldState | null) {
  if (!before || !after) return;
  const fresh = after.news.filter((item) => item.to > before.frontier);
  for (const item of fresh.slice(-3)) {
    const text = item.lines.map((line) => renderLine(settings.language, line)).filter(Boolean).join(" ");
    if (text) toast(text, "news");
  }
}

async function act(choice: Choice, confirmText?: string) {
  if (!save || !world) return;
  const why = check(world, choice);
  if (why) {
    toast(errorText(settings.language, why), "warn");
    return;
  }
  if (confirmText && !(await ask(confirmText))) return;
  const diary = world.diary.length;
  const next = recordChoice(kind, choice);
  if (!next) return;
  save = next;
  world = worldOf(next);
  uiState.picking = null;
  const added = world.diary.slice(diary).filter((entry) => entry.kind === "event");
  const line = added.length ? added[added.length - 1].lines.map((l) => renderLine(settings.language, l)).join(" ") : "";
  toast(line || tr("toast.done"));
  render();
}

// ---- Sync (real world) ---------------------------------------------------------------

function scheduleSync(ms: number) {
  if (syncTimer !== null) window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(() => void syncNow(), ms);
}

async function syncNow() {
  if (kind !== "real" || syncing) return;
  syncing = true;
  syncState = save ? "syncing" : "founding";
  renderSync();
  const before = world;
  try {
    const result = await pull();
    save = result.save;
    world = worldOf(result.save);
    syncState = "idle";
    syncedAt = Date.now();
    reorgNote = result.reorg && !result.founded;
    if (result.added.length) toast(tr("sync.added", { n: result.added.length }), "news");
    announce(before, world);
    scheduleSync(SYNC_MS);
    render();
    void readBoss();
  } catch (error) {
    if (error instanceof BusyError) {
      syncState = "busy";
      scheduleSync(error.retryAfterMs);
    } else {
      syncState = "error";
      console.warn("[squeek-world]", error);
      scheduleSync(SYNC_MS);
    }
    renderSync();
  } finally {
    syncing = false;
  }
}

// ---- The shared boss -------------------------------------------------------------------

function defeatedSeasons(): number[] {
  try {
    const value: unknown = JSON.parse(stored(DEFEATED_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((n): n is number => Number.isSafeInteger(n)) : [];
  } catch {
    return [];
  }
}

/** Remembers a season whose boss the public data shows defeated, for that season's chest. */
function rememberDefeat(season: number) {
  const known = defeatedSeasons();
  if (!known.includes(season)) store(DEFEATED_KEY, JSON.stringify([...known, season].slice(-60)));
}

function bossOfSeason(season: number) {
  if (!save) return null;
  if (kind === "sim") return simulatedBoss(season, save.entries);
  if (!days && !players && !milestones) return null;
  return sharedBoss(season, days, players, milestones);
}

function bossRead(): BossRead {
  if (!world) return { state: "loading" };
  const boss = bossOfSeason(currentSeason(world));
  if (boss && boss.damage !== null) return { state: "ready", boss };
  return bossFailed ? { state: "error" } : { state: "loading" };
}

function defeated(season: number): boolean | null {
  if (kind === "sim") return bossOfSeason(season)?.defeated ?? false;
  if (defeatedSeasons().includes(season)) return true;
  // Only last season is still read from the feed; an older chest opens without
  // the bonus unless this device saw that boss fall.
  if (world && season < currentSeason(world) - 1) return false;
  return bossOfSeason(season)?.defeated ?? null;
}

/** The seasons the boss reads: this one, and last season while its chest waits on the result. */
function bossSeasons(season: number): number[] {
  const last = season - 1;
  if (!world || last < 1 || defeatedSeasons().includes(last) || world.guild.chests.includes(last)) return [season];
  return chestTier(world.guild.contribution[last] ?? 0, false) ? [season, last] : [season];
}

const playerCap = (season: number) => communityCap(bossOf(season));
const milestoneCapOf = (season: number) => milestoneCap(bossOf(season));

/** A failed refresh keeps what was read, unless the feed refused our cursor: then it starts over. */
function keepRead(result: PromiseSettledResult<CommunityRead>, before: CommunityRead | null): CommunityRead | null {
  if (result.status === "fulfilled") return result.value;
  const error: unknown = result.reason;
  if (error instanceof FeedError && !(error instanceof BusyError) && /HTTP 40[09]/.test(error.message)) return null;
  return before;
}

async function readBoss(force = false) {
  if (kind !== "real" || !world) return;
  if (!force && Date.now() - bossReadAt < BOSS_MS / 2) return;
  bossReadAt = Date.now();
  const season = currentSeason(world);
  const seasons = bossSeasons(season);
  const results = await Promise.allSettled([
    readDays(defaultFetch),
    refreshCommunity(defaultFetch, players, "players", seasons, playerCap),
    refreshCommunity(defaultFetch, milestones, "measurement", seasons, milestoneCapOf),
  ]);
  const [d, p, m] = results;
  if (d.status === "fulfilled") days = d.value;
  players = keepRead(p, players);
  milestones = keepRead(m, milestones);
  bossFailed = d.status === "rejected" && !days;
  for (const s of [season - 1, season]) if (s >= 1 && bossOfSeason(s)?.defeated) rememberDefeat(s);
  const busy = results.map((r) => (r.status === "rejected" && r.reason instanceof BusyError ? r.reason : null)).find(Boolean);
  const failed = results.some((r) => r.status === "rejected");
  // Last season's older pages are read in short steps until its result settles.
  const more = backfilling(players, seasons, playerCap) || backfilling(milestones, seasons, milestoneCapOf);
  const delay = busy ? Math.max(busy.retryAfterMs, 15_000) : failed ? 60_000 : more ? 5_000 : BOSS_MS;
  if (bossTimer !== null) window.clearTimeout(bossTimer);
  bossTimer = window.setTimeout(() => void readBoss(true), delay);
  render();
}

// ---- The live hamster -------------------------------------------------------------------

const scene = new SceneView(liveStage);
const machine = new PetMachine(Date.now(), { unitsPerBean: BigInt(settings.unitsPerBean), maxPile: 12 });
const director = new Director(Date.now());
const pointer = idleInput();
const poller = createPoller({
  client: createStatusClient(),
  intervalMs: () => Math.max(10_000, PERFORMANCE[settings.performance].pollMs),
  onResult(outcome, at) {
    machine.dispatch(outcome.ok ? { type: "snapshot", snapshot: outcome.snapshot, at } : { type: "failure", failure: outcome.failure, at });
    renderLive();
    renderSync();
  },
});

function renderLive() {
  const state = machine.state;
  const measurement = state.snapshot?.measurement ?? null;
  let line: string;
  if ((state.mode === "running" || state.mode === "waking") && measurement) line = tr("live.running", { rpm: formatRpm(measurement.rpm) });
  else if (state.mode === "sleeping" || state.mode === "stopping" || state.mode === "eating") line = tr("live.resting");
  else line = tr("live.offline");
  if (measurement && measurement.provenance !== "hardware") line += ` · ${tr("live.labelled", { label: measurement.provenance })}`;
  liveLine.textContent = line;
  liveCard.dataset.mode = state.mode;
}

let drawnAt = 0;
function loop(ts: number) {
  requestAnimationFrame(loop);
  const mode = machine.state.mode;
  const fps = mode === "running" || mode === "waking" || mode === "stopping" || mode === "eating" ? 30 : 10;
  if (ts - drawnAt < 1000 / fps - 2) return;
  drawnAt = ts;
  const now = Date.now();
  machine.dispatch({ type: "tick", at: now });
  scene.apply(director.frame(machine.state, now, pointer, fps));
}

// ---- Drawing -------------------------------------------------------------------------------

function view(): View {
  return {
    lang: settings.language,
    kind,
    world: world!,
    boss: bossRead(),
    defeated,
    ui: uiState,
    act: (choice, confirm) => void act(choice, confirm),
    redraw: render,
    openUrl: (url) => desktop.openUrl(url),
  };
}

function setLanguage(language: Settings["language"]) {
  if (language === settings.language) return;
  settings = sanitize({ ...settings, language });
  saveSettings(settings);
  desktop.broadcastSettings(settings);
  render();
}

function setKind(next: WorldKind) {
  if (next === kind) return;
  kind = next;
  store(MODE_KEY, next);
  uiState.picking = null;
  reload();
  if (kind === "real") {
    void syncNow();
    void readBoss(true);
  }
}

function renderHeader() {
  const badge = h("span", { class: kind === "real" ? "badge live" : "badge trial" }, tr(kind === "real" ? "badge.live" : "badge.trial"));
  headerEl.replaceChildren(
    h("div", { class: "brand" }, h("h1", null, tr("app.title")), h("p", null, tr("app.tagline"))),
    h(
      "div",
      { class: "top-controls" },
      badge,
      segmented<WorldKind>(tr("mode.label"), kind, [["real", tr("mode.real")], ["sim", tr("mode.sim")]], setKind),
      segmented<Settings["language"]>(tr("lang.label"), settings.language, [["en", "EN"], ["zh", "中文"]], setLanguage),
    ),
  );
}

function renderSync() {
  const parts: HTMLElement[] = [];
  if (kind === "sim") {
    const add = (label: string, fn: () => SaveFile) =>
      plainButton(label, () => {
        const before = world;
        save = fn();
        world = worldOf(save);
        announce(before, world);
        render();
      }, "btn small");
    const reset = plainButton(tr("sim.reset"), () => {
      void ask(tr("sim.resetConfirm")).then((yes) => {
        if (!yes) return;
        save = resetSim();
        world = worldOf(save);
        render();
      });
    }, "btn small ghost");
    syncEl.replaceChildren(
      card(
        "sync trial",
        tr("sim.title"),
        hint(tr("sim.note")),
        h("div", { class: "sim-buttons" }, add(tr("sim.active"), () => addSimTurns("active", 1)), add(tr("sim.rest"), () => addSimTurns("rest", 6)), add(tr("sim.day"), () => addSimDay())),
        h("div", { class: "sim-foot" }, reset),
      ),
    );
    return;
  }
  const frontier = save ? (save.entries.length ? save.entries[save.entries.length - 1].to : save.base.frontier) : null;
  if (frontier !== null) parts.push(h("p", { class: "settled" }, art(MARKS.block, "mark"), h("strong", null, tr("sync.settled", { n: String(frontier) }))));
  const status =
    syncState === "syncing"
      ? tr("sync.syncing")
      : syncState === "founding"
        ? tr("sync.founding")
        : syncState === "busy"
          ? tr("sync.busy")
          : syncState === "error"
            ? tr("sync.error")
            : syncedAt
              ? tr("sync.ago", { ago: formatAgo(Date.now() - syncedAt, settings.language) })
              : tr("sync.never");
  parts.push(h("p", { class: syncState === "error" || syncState === "busy" ? "sync-line warn" : "sync-line" }, status));
  if (syncState !== "syncing" && syncState !== "founding") parts.push(plainButton(syncState === "error" ? tr("sync.retry") : tr("sync.now"), () => void syncNow(), "btn small ghost"));
  if (reorgNote) parts.push(hint(tr("sync.reorg"), "hint warn"));
  const queued = machine.state.snapshot?.settlement?.queuedWork;
  if (queued !== undefined && queued !== null) {
    const pending = Number(queued);
    parts.push(
      h(
        "div",
        { class: "pending" },
        h("strong", null, tr("pending.title")),
        h("p", null, pending > 0 ? tr("pending.body", { n: pending, beans: Math.floor(pending / BEANS_PER_WORK) }) : tr("pending.none")),
      ),
    );
  }
  syncEl.replaceChildren(card("sync", null, ...parts));
}

function renderBag() {
  if (!world) {
    bagEl.replaceChildren();
    return;
  }
  const w = world;
  const res = h("div", { class: "bag-grid" }, ...RESOURCES.map((id) => h("div", { class: "bag-item", title: resourceName(settings.language, id) }, art(resIcon(id), "bag-ico"), h("strong", null, num(settings.language, w.res[id])), h("span", null, resourceName(settings.language, id)))));
  const seeds = PLANT_ORDER.filter((id) => PLANTS[id].seedFrom === "packet" && w.seeds[id] > 0).map((id) => h("span", { class: "chip", title: PLANTS[id].name[settings.language] }, art(seedIcon(id), "chip-ico"), h("span", { class: "chip-n" }, `${PLANTS[id].name[settings.language]} ×${num(settings.language, w.seeds[id])}`)));
  const items = [...GEAR, ...CONSUMABLES].filter((id) => w.items[id] > 0).map((id) => h("span", { class: "chip", title: ITEMS[id].effect[settings.language] }, art(itemIcon(id), "chip-ico"), h("span", { class: "chip-n" }, `${ITEMS[id].name[settings.language]}${w.items[id] > 1 ? ` ×${w.items[id]}` : ""}`)));
  bagEl.replaceChildren(
    card(
      "bag",
      tr("res.title"),
      res,
      h("h3", null, tr("bag.seeds")),
      seeds.length ? h("div", { class: "cost" }, ...seeds) : hint(tr("bag.empty")),
      h("h3", null, tr("bag.items")),
      items.length ? h("div", { class: "cost" }, ...items) : hint(tr("bag.empty")),
    ),
  );
}

function renderHelp() {
  const help = h(
    "details",
    { class: "card help" },
    h("summary", null, tr("help.title")),
    h("ol", null, ...(["help.1", "help.2", "help.3", "help.4", "help.5"] as const).map((key) => h("li", null, tr(key)))),
    h("div", { class: "save-buttons" }, plainButton(tr("save.export"), () => saveDialog("export"), "btn small ghost"), plainButton(tr("save.import"), () => saveDialog("import"), "btn small ghost")),
  );
  helpEl.replaceChildren(help);
}

function renderTabs() {
  const labels: Record<Tab, UiKey> = { home: "tab.home", adventure: "tab.adventure", log: "tab.log", guild: "tab.guild" };
  const icons: Record<Tab, string> = { home: MARKS.heart, adventure: MARKS.bag, log: MARKS.moon, guild: MARKS.shield };
  tabsEl.replaceChildren(
    ...TABS.map((tab) => {
      const button = h("button", { type: "button", role: "tab", "aria-selected": String(uiState.tab === tab), class: uiState.tab === tab ? "tab on" : "tab" }, art(icons[tab], "tab-ico"), tr(labels[tab]));
      button.addEventListener("click", () => {
        uiState.tab = tab;
        uiState.picking = null;
        store(TAB_KEY, tab);
        render();
      });
      return button;
    }),
  );
}

function renderPanel() {
  if (!world) {
    panelEl.replaceChildren(card("founding", null, hint(syncState === "error" ? tr("sync.error") : tr("sync.founding"))));
    return;
  }
  const v = view();
  const parts = uiState.tab === "home" ? homeView(v) : uiState.tab === "adventure" ? adventureView(v) : uiState.tab === "log" ? logView(v) : guildView(v);
  panelEl.replaceChildren(...parts);
}

function render() {
  document.documentElement.lang = settings.language === "zh" ? "zh-CN" : "en";
  document.title = tr("app.title");
  document.body.dataset.world = kind;
  (liveCard.querySelector("h2") as HTMLElement).textContent = tr("live.title");
  (liveCard.querySelector(".live-note") as HTMLElement).textContent = tr("live.note");
  renderHeader();
  renderLive();
  renderSync();
  renderBag();
  renderHelp();
  renderTabs();
  renderPanel();
}

// ---- Start -------------------------------------------------------------------------------

desktop.onSettings((raw) => {
  const next = sanitize(raw, settings);
  if (next.language !== settings.language) {
    settings = next;
    render();
  } else settings = next;
});

window.addEventListener("storage", (event) => {
  if (event.key === SAVE_KEYS[kind]) reload();
});

window.addEventListener("focus", () => {
  if (kind === "real" && (!syncedAt || Date.now() - syncedAt > 30_000)) void syncNow();
});

if (inTauri) document.body.classList.add("desktop");
reload();
poller.start();
requestAnimationFrame(loop);
window.setInterval(() => renderSync(), 30_000);
if (kind === "real") {
  void syncNow();
  void readBoss(true);
}

// Hooks for automated screenshots in a plain browser.
if (!inTauri) {
  Object.assign(window, {
    __squeekWorld: {
      get world() {
        return world;
      },
      tab(tab: Tab) {
        uiState.tab = tab;
        render();
      },
      kind: setKind,
      act: (choice: Choice) => act(choice),
    },
  });
}
