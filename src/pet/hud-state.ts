import type { HudLabels } from "./hud";
import type { BubbleContent, PanelContent, ToastContent } from "./present";

export interface HudToast {
  id: number;
  at: number;
  content: ToastContent;
}

/** Plain display data sent to the detached desktop card window. */
export interface HudState {
  bubble: BubbleContent | null;
  panel: PanelContent | null;
  labels: HudLabels;
  zoom: number;
  toasts: HudToast[];
}

export type HudAction = { type: "close" } | { type: "settings" } | { type: "url"; url: string };

export function toastLifetime(content: ToastContent): number {
  return (content.action ? 6500 : 3800) + 300;
}
