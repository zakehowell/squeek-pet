import css from "../styles/world.css?inline";
import { createStatusClient } from "../core/api";
import { formatAgo } from "../core/format";
import type { Language } from "../core/i18n";
import { artDefs, itemIcon, MARKS, resIcon, seedIcon } from "./art/icons";
import { worldDefs } from "./art/world-art";
import { backfilling, communityCap, milestoneCap, refreshCommunity, sharedBoss, simulatedBoss } from "./boss";
import { BEANS_PER_WORK, CONSUMABLES, GEAR, ITEMS, PLANTS, PLANT_ORDER, RESOURCES } from "./data";
import { check, chestTier, currentSeason } from "./engine";
import { BusyError, defaultFetch, readDays, type CommunityRead, type WorkBucket } from "./feed";
import { errorText, num, renderLine, resourceName, ui, type UiKey } from "./i18n";
import { FeedError } from "./ledger";
import { bossOf } from "./season";
import { addSimDay, addSimTurns, loadSim, resetSim } from "./sim";
import { exportSave, importSave, loadSave, SAVE_KEYS, worldOf, writeSave, type SaveFile, type WorldKind } from "./store";
import { pull, recordChoice } from "./sync";
import type { Choice, WorldState } from "./types";
import { adventureView } from "./ui/adventure";
import { arrowStep, art, focusSpot, h, restoreFocus, setArtDefs } from "./ui/dom";
import { guildView } from "./ui/guild";
import { homeView } from "./ui/home";
import { logView } from "./ui/log";
import { card, hint, plainButton, segmented, type BossRead, type Tab, type UiState, type View } from "./ui/parts";

// Squeek Pet World as a web page part: the real world built from settled
// SqueekCore turns, or the clearly labelled trial world. The page around it
// (squeekpulse.xyz/world/) owns the title, the language switch and the live
// hamster; the World draws itself inside a shadow root, so the page's styles
// and the World's never touch. Saves stay in this browser's localStorage.

const SYNC_MS = 120_000;
const BOSS_MS = 600_000;
const STATUS_MS = 60_000;
const MODE_KEY = "squeek-world:mode";
const TAB_KEY = "squeek-world:tab";
const DEFEATED_KEY = "squeek-world:defeated";
const TABS: readonly Tab[] = ["home", "adventure", "log", "guild"];

export interface WorldOptions {
  language: Language;
  /** Opens a link; a new browser tab by default. */
  openUrl?: (url: string) => void;
  /** Read `?mode=` and `?tab=` from this query string; the page's own by default. */
  search?: string;
}

/** What the page can do with a mounted World. */
export interface WorldHandle {
  setLanguage(language: Language): void;
  readonly world: WorldState | null;
  /** Hooks for automated screenshots. */
  tab(tab: Tab): void;
  kind(kind: WorldKind): void;
  act(choice: Choice): Promise<void>;
  destroy(): void;
}

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

const defsOf = (markup: string) => [...markup.matchAll(/<defs>([\s\S]*?)<\/defs>/g)].map((m) => m[1]).join("");

export function mountWorld(host: HTMLElement, options: WorldOptions): WorldHandle {
  let lang: Language = options.language === "zh" ? "zh" : "en";
  const openUrl = options.openUrl ?? ((url: string) => void window.open(url, "_blank", "noopener"));
  const params = new URLSearchParams(options.search ?? location.search);

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
  let destroyed = false;

  let days: WorkBucket[] | null = null;
  let players: CommunityRead | null = null;
  let milestones: CommunityRead | null = null;
  let bossFailed = false;
  let bossReadAt = 0;
  let bossTimer: number | null = null;

  /** Measured work SqueekCore has not settled yet, from GET /v1/status. */
  const status = createStatusClient();
  let queued: bigint | null = null;

  const tr = (key: UiKey, values?: Record<string, string | number>) => ui(lang, key, values);

  // ---- Page skeleton --------------------------------------------------------------

  const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = css;
  const defsMarkup = worldDefs() + artDefs();
  setArtDefs(defsOf(defsMarkup));
  const defs = h("div", { class: "defs" });
  // Gradients for the vector drawings, used only where a browser can't make pixel art.
  defs.innerHTML = defsMarkup;
  const root = h("div", { class: "world" });
  const headerEl = h("header", { class: "top" });
  const syncEl = h("div", { class: "side-sync" });
  const bagEl = h("div", { class: "side-bag" });
  const helpEl = h("div", { class: "side-help" });
  const tabsEl = h("nav", { class: "tabs", role: "tablist" });
  const panelEl = h("div", { class: "tab-panel", role: "tabpanel", id: "world-panel" });
  const toastsEl = h("div", { class: "toasts", "aria-live": "polite" });
  root.append(
    defs,
    headerEl,
    h("div", { class: "layout" }, h("aside", { class: "side" }, syncEl, bagEl, helpEl), h("div", { class: "content" }, tabsEl, panelEl)),
    toastsEl,
  );
  shadow.replaceChildren(style, root);

  // Two columns when the World has room for them; smaller pieces on a phone.
  const fit = (width: number) => {
    root.classList.toggle("wide", width >= 860);
    root.classList.toggle("compact", width < 560);
  };
  const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver((entries) => fit(entries[0].contentRect.width));
  resize?.observe(host);
  fit(host.clientWidth);

  // ---- Toasts and dialogs ----------------------------------------------------------

  function toast(text: string, tone: "ok" | "warn" | "news" = "ok") {
    const node = h("div", { class: `toast ${tone}` }, text);
    toastsEl.append(node);
    while (toastsEl.children.length > 4) toastsEl.firstElementChild?.remove();
    window.setTimeout(() => node.classList.add("out"), tone === "news" ? 6500 : 3200);
    window.setTimeout(() => node.remove(), tone === "news" ? 7000 : 3700);
  }

  /**
   * Keeps Tab inside an open dialog, closes it on Escape, and hands focus back
   * to whatever opened it once it closes.
   */
  function modal(overlay: HTMLElement, onEscape: () => void): () => void {
    const opener = shadow.activeElement as HTMLElement | null;
    const spot = focusSpot(shadow, regions);
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onEscape();
        return;
      }
      if (event.key !== "Tab") return;
      const stops = [...overlay.querySelectorAll<HTMLElement>("button, textarea")];
      if (!stops.length) return;
      const first = stops[0];
      const last = stops[stops.length - 1];
      if (event.shiftKey && shadow.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && shadow.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    root.append(overlay);
    return () => {
      overlay.remove();
      // A sync may have redrawn the page meanwhile; then the opener's replacement gets focus.
      if (opener?.isConnected) opener.focus({ preventScroll: true });
      else if (spot) restoreFocus(shadow, regions, spot);
    };
  }

  /**
   * An in-page confirm that matches the page, instead of the browser's own
   * dialog. Every question asks before something is lost, so focus starts on
   * Cancel and a second Enter can't confirm by accident.
   */
  function ask(message: string): Promise<boolean> {
    return new Promise((resolve) => {
      const done = (answer: boolean) => {
        close();
        resolve(answer);
      };
      const cancel = plainButton(tr("confirm.cancel"), () => done(false), "btn");
      const text = h("p", { id: "world-ask" }, message);
      const overlay = h(
        "div",
        { class: "overlay", role: "alertdialog", "aria-modal": "true", "aria-describedby": "world-ask" },
        h("div", { class: "dialog" }, text, h("div", { class: "dialog-actions" }, cancel, plainButton(tr("confirm.ok"), () => done(true), "btn primary"))),
      );
      const close = modal(overlay, () => done(false));
      cancel.focus();
    });
  }

  function saveDialog(mode: "export" | "import") {
    const text = h("textarea", { class: "save-text", spellcheck: "false", rows: 10, "aria-labelledby": "world-save-title" });
    const close = () => closeModal();
    const actions = h("div", { class: "dialog-actions" }, plainButton(tr("save.close"), close, "btn"));
    if (mode === "export" && save) {
      text.value = exportSave(save);
      text.readOnly = true;
      const copy = plainButton(
        tr("save.copy"),
        () => {
          text.select();
          void navigator.clipboard?.writeText(text.value).then(
            () => toast(tr("save.copied")),
            () => document.execCommand("copy"),
          );
        },
        "btn primary",
      );
      actions.append(copy);
    } else {
      const load = plainButton(
        tr("save.load"),
        () => {
          const imported = importSave(text.value, kind);
          if (!imported) {
            toast(tr("save.badImport"), "warn");
            return;
          }
          writeSave(imported);
          close();
          reload();
          toast(tr("save.imported"));
        },
        "btn primary",
      );
      actions.append(load);
    }
    const note = mode === "export" ? tr("save.exportNote") : tr("save.importNote", { world: tr(kind === "real" ? "mode.real" : "mode.sim") });
    const overlay = h(
      "div",
      { class: "overlay", role: "dialog", "aria-modal": "true", "aria-labelledby": "world-save-title" },
      h("div", { class: "dialog wide" }, h("h2", { id: "world-save-title" }, tr(mode === "export" ? "save.export" : "save.import")), h("p", { class: "hint" }, note), text, actions),
    );
    const closeModal = modal(overlay, close);
    text.focus();
  }

  // ---- Keeping keyboard focus ---------------------------------------------------------

  const regions = [headerEl, syncEl, bagEl, helpEl, tabsEl, panelEl];
  let drawing = false;

  /** Redraws without losing the keyboard user's place (see ./ui/dom). */
  function keepFocus(draw: () => void) {
    if (drawing) return draw();
    const spot = focusSpot(shadow, regions);
    drawing = true;
    try {
      draw();
    } finally {
      drawing = false;
    }
    if (spot) restoreFocus(shadow, regions, spot);
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
      const text = item.lines
        .map((line) => renderLine(lang, line))
        .filter(Boolean)
        .join(" ");
      if (text) toast(text, "news");
    }
  }

  async function act(choice: Choice, confirmText?: string) {
    if (!save || !world) return;
    const why = check(world, choice);
    if (why) {
      toast(errorText(lang, why), "warn");
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
    const line = added.length ? added[added.length - 1].lines.map((l) => renderLine(lang, l)).join(" ") : "";
    toast(line || tr("toast.done"));
    render();
  }

  // ---- Sync (real world) ---------------------------------------------------------------

  function scheduleSync(ms: number) {
    if (syncTimer !== null) window.clearTimeout(syncTimer);
    if (!destroyed) syncTimer = window.setTimeout(() => void syncNow(), ms);
  }

  async function syncNow() {
    if (kind !== "real" || syncing || destroyed) return;
    syncing = true;
    syncState = save ? "syncing" : "founding";
    renderSync();
    void readQueued();
    const before = world;
    try {
      const result = await pull();
      if (destroyed || kind !== "real") return;
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

  async function readQueued() {
    const outcome = await status.fetchStatus();
    if (!outcome.ok || destroyed) return;
    queued = outcome.snapshot.settlement?.queuedWork ?? null;
    renderSync();
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
    // the bonus unless this browser saw that boss fall.
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
    if (kind !== "real" || !world || destroyed) return;
    if (!force && Date.now() - bossReadAt < BOSS_MS / 2) return;
    bossReadAt = Date.now();
    const season = currentSeason(world);
    const seasons = bossSeasons(season);
    const results = await Promise.allSettled([
      readDays(defaultFetch),
      refreshCommunity(defaultFetch, players, "players", seasons, playerCap),
      refreshCommunity(defaultFetch, milestones, "measurement", seasons, milestoneCapOf),
    ]);
    if (destroyed) return;
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

  // ---- Drawing -------------------------------------------------------------------------------

  function view(): View {
    return {
      lang,
      kind,
      world: world!,
      boss: bossRead(),
      defeated,
      ui: uiState,
      act: (choice, confirm) => void act(choice, confirm),
      redraw: render,
      openUrl,
    };
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
    const real = kind === "real";
    headerEl.replaceChildren(
      segmented<WorldKind>(tr("mode.label"), kind, [["real", tr("mode.real")], ["sim", tr("mode.sim")]], setKind),
      h("span", { class: real ? "badge live" : "badge trial" }, h("i", { class: "dot", "aria-hidden": "true" }), tr(real ? "badge.live" : "badge.trial")),
    );
  }

  function renderSync() {
    keepFocus(drawSync);
  }

  function drawSync() {
    if (kind === "sim") {
      const add = (label: string, fn: () => SaveFile) =>
        plainButton(
          label,
          () => {
            const before = world;
            save = fn();
            world = worldOf(save);
            announce(before, world);
            render();
          },
          "btn small",
        );
      const reset = plainButton(
        tr("sim.reset"),
        () => {
          void ask(tr("sim.resetConfirm")).then((yes) => {
            if (!yes) return;
            save = resetSim();
            world = worldOf(save);
            render();
          });
        },
        "btn small ghost",
      );
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
    const parts: HTMLElement[] = [];
    const frontier = save ? (save.entries.length ? save.entries[save.entries.length - 1].to : save.base.frontier) : null;
    if (frontier !== null) parts.push(h("p", { class: "settled" }, art(MARKS.block, "mark"), h("strong", null, tr("sync.settled", { n: String(frontier) }))));
    const line =
      syncState === "syncing"
        ? tr("sync.syncing")
        : syncState === "founding"
          ? tr("sync.founding")
          : syncState === "busy"
            ? tr("sync.busy")
            : syncState === "error"
              ? tr("sync.error")
              : syncedAt
                ? tr("sync.ago", { ago: formatAgo(Date.now() - syncedAt, lang) })
                : tr("sync.never");
    parts.push(h("p", { class: syncState === "error" || syncState === "busy" ? "sync-line warn" : "sync-line" }, line));
    if (syncState !== "syncing" && syncState !== "founding") parts.push(plainButton(syncState === "error" ? tr("sync.retry") : tr("sync.now"), () => void syncNow(), "btn small ghost"));
    if (reorgNote) parts.push(hint(tr("sync.reorg"), "hint warn"));
    if (queued !== null) {
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
    syncEl.replaceChildren(card("sync", tr("mode.real"), ...parts));
  }

  function renderBag() {
    if (!world) {
      bagEl.replaceChildren();
      return;
    }
    const w = world;
    const res = h(
      "div",
      { class: "bag-grid" },
      ...RESOURCES.map((id) => h("div", { class: "bag-item", title: resourceName(lang, id) }, art(resIcon(id), "bag-ico"), h("strong", null, num(lang, w.res[id])), h("span", null, resourceName(lang, id)))),
    );
    const seeds = PLANT_ORDER.filter((id) => PLANTS[id].seedFrom === "packet" && w.seeds[id] > 0).map((id) =>
      h("span", { class: "chip", title: PLANTS[id].name[lang] }, art(seedIcon(id), "chip-ico"), h("span", { class: "chip-n" }, `${PLANTS[id].name[lang]} ×${num(lang, w.seeds[id])}`)),
    );
    const items = [...GEAR, ...CONSUMABLES]
      .filter((id) => w.items[id] > 0)
      .map((id) =>
        h("span", { class: "chip", title: ITEMS[id].effect[lang] }, art(itemIcon(id), "chip-ico"), h("span", { class: "chip-n" }, `${ITEMS[id].name[lang]}${w.items[id] > 1 ? ` ×${w.items[id]}` : ""}`)),
      );
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
    const open = helpEl.querySelector("details")?.open ?? false;
    const help = h(
      "details",
      { class: "card help", open },
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
        const on = uiState.tab === tab;
        const button = h(
          "button",
          { type: "button", role: "tab", id: `world-tab-${tab}`, "aria-controls": "world-panel", "aria-selected": String(on), tabindex: on ? 0 : -1, class: on ? "tab on" : "tab" },
          art(icons[tab], "tab-ico"),
          tr(labels[tab]),
        );
        button.addEventListener("click", () => showTab(tab));
        return button;
      }),
    );
  }

  function showTab(tab: Tab) {
    uiState.tab = tab;
    uiState.picking = null;
    store(TAB_KEY, tab);
    render();
  }

  function renderPanel() {
    panelEl.setAttribute("aria-labelledby", `world-tab-${uiState.tab}`);
    if (!world) {
      panelEl.replaceChildren(card("founding", null, hint(syncState === "error" ? tr("sync.error") : tr("sync.founding"))));
      return;
    }
    const v = view();
    const parts = uiState.tab === "home" ? homeView(v) : uiState.tab === "adventure" ? adventureView(v) : uiState.tab === "log" ? logView(v) : guildView(v);
    panelEl.replaceChildren(...parts);
  }

  function render() {
    if (destroyed) return;
    root.lang = lang === "zh" ? "zh-CN" : "en";
    root.dataset.world = kind;
    keepFocus(() => {
      renderHeader();
      drawSync();
      renderBag();
      renderHelp();
      renderTabs();
      renderPanel();
    });
  }

  // Tabs follow the arrow keys, as tab rows do elsewhere.
  tabsEl.addEventListener("keydown", (event) => {
    const next = arrowStep(event.key, TABS, uiState.tab);
    if (!next) return;
    event.preventDefault();
    if (next !== uiState.tab) showTab(next);
    tabsEl.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
  });

  // ---- Start -------------------------------------------------------------------------------

  const onStorage = (event: StorageEvent) => {
    if (event.key === SAVE_KEYS[kind]) reload();
  };
  const onFocus = () => {
    if (kind === "real" && (!syncedAt || Date.now() - syncedAt > 30_000)) void syncNow();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener("focus", onFocus);

  reload();
  const agoTimer = window.setInterval(() => renderSync(), 30_000);
  const statusTimer = window.setInterval(() => {
    if (kind === "real" && document.visibilityState === "visible") void readQueued();
  }, STATUS_MS);
  if (kind === "real") {
    void syncNow();
    void readBoss(true);
  }

  return {
    setLanguage(next: Language) {
      const language = next === "zh" ? "zh" : "en";
      if (language === lang) return;
      lang = language;
      render();
    },
    get world() {
      return world;
    },
    tab: showTab,
    kind: setKind,
    act: (choice: Choice) => act(choice),
    destroy() {
      destroyed = true;
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
      resize?.disconnect();
      window.clearInterval(agoTimer);
      window.clearInterval(statusTimer);
      if (syncTimer !== null) window.clearTimeout(syncTimer);
      if (bossTimer !== null) window.clearTimeout(bossTimer);
      shadow.replaceChildren();
    },
  };
}
