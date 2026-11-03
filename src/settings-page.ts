import "./styles/settings.css";
import { t, type MessageKey } from "./core/i18n";
import { BEAN_SIZES, PERFORMANCE, SCALE, loadSettings, sanitize, saveSettings, type Settings } from "./core/settings";
import { DOCS_URL, PULSE_URL } from "./pet/present";
import { desktop } from "./platform/desktop";

// The settings window. Changes are saved and broadcast to the pet at once.

const VERSION = "0.1.2";
let settings = loadSettings();
let autostart: boolean | null = null;
const app = document.getElementById("settings")!;
const tr = (key: MessageKey, values?: Record<string, string>) => t(settings.language, key, values);

/** Saves and broadcasts a change. A slider drag skips the re-render, which would end the drag. */
function update(patch: Partial<Settings>, rerender = true) {
  settings = sanitize({ ...settings, ...patch });
  saveSettings(settings);
  desktop.broadcastSettings(settings);
  if (rerender) render();
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function segmented<T extends string | number>(label: string, value: T, options: [T, string][], onPick: (v: T) => void, note?: string) {
  const row = el("div", "row row--stack");
  row.append(el("span", "label", label));
  const group = el("div", "segmented");
  group.setAttribute("role", "radiogroup");
  group.setAttribute("aria-label", label);
  for (const [option, text] of options) {
    const button = el("button", option === value ? "active" : "", text);
    button.type = "button";
    button.setAttribute("role", "radio");
    button.setAttribute("aria-checked", String(option === value));
    button.addEventListener("click", () => onPick(option));
    group.append(button);
  }
  row.append(group);
  if (note) row.append(el("p", "hint", note));
  return row;
}

/** The pet size slider. Every step is applied to the pet at once, while dragging. */
function sizeSlider(label: string, value: number, onInput: (v: number) => void, note: string) {
  const row = el("div", "row row--stack");
  const head = el("div", "slider-head");
  const output = el("output", "slider-value");
  head.append(el("span", "label", label), output);
  const input = el("input", "slider");
  input.type = "range";
  input.min = String(SCALE.min);
  input.max = String(SCALE.max);
  input.step = String(SCALE.step);
  input.value = String(value);
  input.setAttribute("aria-label", label);
  const show = (v: number) => {
    output.textContent = `${v}%`;
    input.setAttribute("aria-valuetext", `${v}%`);
    input.style.setProperty("--fill", `${((v - SCALE.min) / (SCALE.max - SCALE.min)) * 100}%`);
  };
  show(value);
  input.addEventListener("input", () => {
    const v = Number(input.value);
    show(v);
    onInput(v);
  });
  const ends = el("div", "slider-ends");
  ends.append(el("span", "", `${SCALE.min}%`), el("span", "", `${SCALE.max}%`));
  row.append(head, input, ends, el("p", "hint", note));
  return row;
}

function toggle(label: string, checked: boolean | null, onChange: (on: boolean) => void, note?: string) {
  const row = el("label", "row");
  const text = el("span", "label-block");
  text.append(el("span", "label", label));
  if (note) text.append(el("span", "hint", note));
  const input = el("input");
  input.type = "checkbox";
  input.setAttribute("role", "switch");
  input.checked = checked === true;
  input.disabled = checked === null;
  input.addEventListener("change", () => onChange(input.checked));
  row.append(text, input);
  return row;
}

function section(title: string, ...rows: HTMLElement[]) {
  const node = el("section", "group");
  node.append(el("h2", "", title), ...rows);
  return node;
}

function link(text: string, url: string) {
  const a = el("a", "", `${text} ↗`);
  a.href = url;
  a.addEventListener("click", (e) => {
    e.preventDefault();
    desktop.openUrl(url);
  });
  return a;
}

function render() {
  document.documentElement.lang = settings.language === "zh" ? "zh-CN" : "en";
  document.title = tr("settings.title");
  const perf = PERFORMANCE[settings.performance];

  const header = el("header");
  header.append(el("h1", "", tr("settings.title")), el("p", "", tr("settings.subtitle")));

  const pet = section(
    tr("settings.pet"),
    segmented("Language / 语言", settings.language, [["en", "English"], ["zh", "中文"]], (language) => update({ language })),
    sizeSlider(tr("settings.size"), settings.scale, (scale) => update({ scale }, false), tr("settings.sizeNote", { min: String(SCALE.hudMin) })),
    segmented(
      tr("settings.performance"),
      settings.performance,
      [["eco", tr("settings.eco")], ["balanced", tr("settings.balanced")], ["smooth", tr("settings.smooth")]],
      (performance) => update({ performance }),
      tr("settings.performanceNote", { fps: String(perf.fps), seconds: String(perf.pollMs / 1000) }),
    ),
    segmented(
      tr("settings.beanSize"),
      settings.unitsPerBean,
      BEAN_SIZES.map((n) => [n, String(n)] as [number, string]),
      (unitsPerBean) => update({ unitsPerBean }),
      tr("settings.beanNote"),
    ),
  );

  const behaviour = section(
    tr("settings.behaviour"),
    toggle(tr("settings.alwaysOnTop"), settings.alwaysOnTop, (alwaysOnTop) => update({ alwaysOnTop })),
    toggle(tr("settings.autostart"), autostart, (on) => void setAutostart(on), autostart === null ? tr("settings.desktopOnly") : undefined),
    toggle(tr("settings.sounds"), settings.sounds, (sounds) => update({ sounds })),
    toggle(tr("settings.toasts"), settings.toasts, (toasts) => update({ toasts }), tr("settings.toastsNote")),
    toggle(tr("settings.demo"), settings.demo, (demo) => update({ demo }), tr("settings.demoNote")),
  );

  const links = el("p", "links");
  links.append(link("Squeek Pulse", PULSE_URL), link(tr("settings.docs"), DOCS_URL));
  const data = section(tr("settings.data"), el("p", "hint hint--block", tr("settings.dataNote")), links);

  const footer = el("footer", "", tr("settings.version", { v: VERSION }));
  app.replaceChildren(header, pet, behaviour, data, footer);
}

async function setAutostart(on: boolean) {
  try {
    await desktop.setAutostart(on);
  } catch (error) {
    console.warn("[squeek-pet] autostart", error);
  }
  autostart = await desktop.autostart();
  render();
}

desktop.onSettings((raw) => {
  if (!raw || typeof raw !== "object") return;
  const next = sanitize(raw);
  // Our own broadcast comes back too; re-rendering for it would interrupt a slider drag.
  if (JSON.stringify(next) === JSON.stringify(settings)) return;
  settings = next;
  render();
});

render();
void desktop.autostart().then((on) => {
  autostart = on;
  render();
});
