import { desktop } from "../platform/desktop";
import { Hud, type HudActions, type HudLabels } from "./hud";
import { toastLifetime, type HudState } from "./hud-state";
import type { BubbleContent, PanelContent, ToastContent } from "./present";

/** Keeps the provenance tag with the pet and renders cards in their own window. */
export class DesktopHud extends Hud {
  private readonly state: HudState = {
    bubble: null,
    panel: null,
    labels: { pulse: "Squeek Pulse", settings: "Settings", close: "Close" },
    zoom: 0.8,
    toasts: [],
  };
  private queued = false;
  private sent = "";
  private toastId = 0;

  constructor(root: HTMLElement, actions: HudActions) {
    super(root, actions);
    desktop.onHudAction((action) => {
      if (action.type === "close") actions.closePanel();
      else if (action.type === "settings") actions.openSettings();
      else if (action.type === "url") actions.openUrl(action.url);
    });
  }

  override get panelOpen(): boolean {
    return this.state.panel !== null;
  }

  setZoom(zoom: number) {
    this.state.zoom = zoom;
    this.publish();
  }

  override setBubble(content: BubbleContent | null) {
    this.state.bubble = content;
    this.publish();
  }

  override setPanel(content: PanelContent | null, labels: HudLabels) {
    this.state.panel = content;
    this.state.labels = labels;
    this.publish();
  }

  override toast(content: ToastContent) {
    this.state.toasts.push({ id: ++this.toastId, at: Date.now(), content });
    this.state.toasts = this.state.toasts.slice(-2);
    this.publish();
  }

  override interactiveRects(): DOMRect[] {
    // Buttons belong to the detached HUD, not the pet's click-through regions.
    return [];
  }

  private publish() {
    if (this.queued) return;
    this.queued = true;
    queueMicrotask(() => {
      this.queued = false;
      const now = Date.now();
      this.state.toasts = this.state.toasts.filter((item) => now - item.at < toastLifetime(item.content));
      const key = JSON.stringify(this.state);
      if (key === this.sent) return;
      this.sent = key;
      desktop.updateHud(this.state);
    });
  }
}
