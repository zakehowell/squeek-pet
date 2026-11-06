import type { Language } from "./core/i18n";
import { mountWorld } from "./world/app";
import { ui } from "./world/i18n";

// A bare page for working on Squeek Pet World with `npm run dev` (/world.html).
// The real page is squeekpulse.xyz/world/: it mounts the built library
// (`npm run build:world`) with the site's own header, language switch, fonts
// and live hamster.

let lang: Language = new URLSearchParams(location.search).get("lang") === "zh" ? "zh" : "en";
const title = document.querySelector("h1")!;
const toggle = document.querySelector<HTMLButtonElement>("#lang")!;
const world = mountWorld(document.querySelector<HTMLElement>("#world")!, { language: lang });

function label() {
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  document.title = `${ui(lang, "app.title")} · dev`;
  title.textContent = ui(lang, "app.title");
  toggle.textContent = lang === "zh" ? "EN" : "中文";
}

toggle.addEventListener("click", () => {
  lang = lang === "zh" ? "en" : "zh";
  world.setLanguage(lang);
  label();
});
label();

// Hooks for automated screenshots.
Object.assign(window, { __squeekWorld: world });
