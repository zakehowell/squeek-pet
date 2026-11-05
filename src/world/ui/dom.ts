// Small DOM helpers for the World window. Text always goes in as text nodes;
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

/** One of our own drawings. Never pass markup built from data read from outside. */
export function art(markup: string, cls = "art"): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = cls;
  span.innerHTML = markup;
  return span;
}
