// The "watch live on X" pill that appears beside the wheel while
// Squeektoshi runs and the pointer rests on the pet. It lives in the pet
// window itself, so it never depends on the detached card window.

export interface LiveButtonLabels {
  text: string;
  title: string;
}

export class LiveButton {
  readonly node: HTMLButtonElement;
  private readonly label: HTMLSpanElement;

  constructor(root: HTMLElement, onClick: () => void) {
    this.node = document.createElement("button");
    this.node.type = "button";
    this.node.className = "live-link";
    this.node.hidden = true;

    const dot = document.createElement("span");
    dot.className = "live-link__dot";
    dot.setAttribute("aria-hidden", "true");
    this.label = document.createElement("span");
    const arrow = document.createElement("span");
    arrow.className = "live-link__arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "↗";

    this.node.append(dot, this.label, arrow);
    this.node.addEventListener("click", onClick);
    root.append(this.node);
  }

  get visible(): boolean {
    return !this.node.hidden;
  }

  setLabels(labels: LiveButtonLabels) {
    if (this.label.textContent !== labels.text) this.label.textContent = labels.text;
    if (this.node.title !== labels.title) {
      this.node.title = labels.title;
      this.node.setAttribute("aria-label", labels.title);
    }
  }

  setVisible(visible: boolean) {
    if (this.node.hidden === !visible) return;
    this.node.hidden = !visible;
  }

  /** Window-relative box that must catch the pointer while the pill shows. */
  rect(): DOMRect | null {
    return this.node.hidden ? null : this.node.getBoundingClientRect();
  }
}
