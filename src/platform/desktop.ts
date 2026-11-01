import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { Menu, type MenuOptions } from "@tauri-apps/api/menu";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { disable as disableAutostart, enable as enableAutostart, isEnabled as autostartEnabled } from "@tauri-apps/plugin-autostart";
import { openUrl as openExternal } from "@tauri-apps/plugin-opener";
import type { Settings } from "../core/settings";
import type { HudAction, HudState } from "../pet/hud-state";

// Everything that needs the desktop shell goes through here. In a plain
// browser (npm run dev) each call falls back to a harmless equivalent, so the
// pet can be developed and previewed without Tauri.

export const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export interface HitRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CursorEvent {
  x: number;
  y: number;
  inside: boolean;
}

export interface TrayLabels {
  toggle: string;
  details: string;
  demo: string;
  settings: string;
  quit: string;
  demoOn: boolean;
}

export type MenuItems = NonNullable<MenuOptions["items"]>;

const SETTINGS_EVENT = "settings://changed";

function quietly(promise: Promise<unknown>) {
  promise.catch((error) => console.warn("[squeek-pet]", error));
}

export const desktop = {
  /** Window areas that catch the mouse. Everything else clicks through to the desktop. */
  setHitRegions(rects: HitRect[]) {
    if (inTauri) quietly(invoke("set_hit_regions", { rects }));
  },
  startDrag() {
    if (inTauri) quietly(getCurrentWindow().startDragging());
  },
  /** Resizes the pet window around its bottom-right corner, where the pet stands. */
  resizePet(width: number, height: number) {
    if (inTauri) quietly(invoke("resize_pet", { width, height }));
  },
  setAlwaysOnTop(on: boolean) {
    if (inTauri) quietly(invoke("set_pet_always_on_top", { on }));
  },
  updateHud(payload: HudState) {
    if (inTauri) quietly(invoke("update_hud", { payload }));
  },
  onHudAction(handler: (action: HudAction) => void) {
    if (inTauri) quietly(listen<HudAction>("pet://hud-action", (event) => handler(event.payload)));
  },
  hidePet() {
    if (inTauri) quietly(invoke("hide_pet"));
  },
  quit() {
    if (inTauri) quietly(invoke("quit_app"));
  },
  openSettings() {
    if (inTauri) quietly(invoke("open_settings"));
    else window.open("/settings.html", "squeek-pet-settings", "width=420,height=680");
  },
  openUrl(url: string) {
    if (inTauri) quietly(openExternal(url));
    else window.open(url, "_blank", "noopener");
  },
  setTrayLabels(labels: TrayLabels) {
    if (inTauri) quietly(invoke("set_tray_labels", { labels }));
  },
  async popupMenu(items: MenuItems): Promise<boolean> {
    if (!inTauri) return false;
    const menu = await Menu.new({ items });
    await menu.popup();
    return true;
  },
  onCursor(handler: (event: CursorEvent) => void) {
    if (inTauri) quietly(listen<CursorEvent>("pet://cursor", (e) => handler(e.payload)));
  },
  /** Tray menu items that the pet window handles ("details", "demo"). */
  onTrayAction(handler: (action: string) => void) {
    if (inTauri) quietly(listen<string>("pet://menu", (e) => handler(e.payload)));
  },
  broadcastSettings(settings: Settings) {
    if (inTauri) quietly(emit(SETTINGS_EVENT, settings));
  },
  onSettings(handler: (raw: unknown) => void) {
    if (inTauri) quietly(listen(SETTINGS_EVENT, (e) => handler(e.payload)));
    // Browser fallback: another tab of the same origin saved new settings.
    else window.addEventListener("storage", (e) => e.key && e.newValue && handler(safeParse(e.newValue)));
  },
  async autostart(): Promise<boolean | null> {
    if (!inTauri) return null;
    try {
      return await autostartEnabled();
    } catch {
      return null;
    }
  },
  async setAutostart(on: boolean) {
    if (inTauri) await (on ? enableAutostart() : disableAutostart());
  },
};

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
