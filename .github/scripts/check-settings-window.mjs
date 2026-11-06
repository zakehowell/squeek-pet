// Windows smoke test for the settings window, run by windows.yml and release.yml.
//
// It opens the settings window the way the pet's right-click menu and its
// details card do (the pet page invokes the open_settings command), then checks
// that the settings page really rendered. Squeek Pet must already be running
// with WebView2's DevTools port open (--remote-debugging-port=9222); see
// webview.mjs.
//
// Squeek Pet 0.1.1 fails this check: open_settings never returns and the new
// window stays blank white, because WebView2 cannot finish creating a webview
// while the main thread is busy running a synchronous command.

import { appPage, evaluate, invokeCommand, pageName, pages, petPage, sleep, waitFor } from "./webview.mjs";

const pet = await petPage();
console.log(`pet page: ${pet.url}`);
if (await appPage("settings.html")) {
  throw new Error("the settings window was open before this check opened it");
}

await invokeCommand(pet, "open_settings");
console.log("open_settings returned");

const settings = await waitFor("the settings page did not appear", 30, () => appPage("settings.html"));
const rendered = await waitFor("the settings page did not render", 30, async () => {
  const state = await evaluate(
    settings,
    `({
      ready: document.readyState,
      heading: document.querySelector("#settings h1")?.textContent ?? "",
      rows: document.querySelectorAll("#settings .row").length,
      background: getComputedStyle(document.body).backgroundColor,
    })`,
    10,
  );
  return state.ready === "complete" && state.heading && state.rows > 0 ? state : null;
});
console.log(`settings page: ${settings.url}`);
console.log(`  heading "${rendered.heading}", ${rendered.rows} setting rows, background ${rendered.background}`);

// Opening it again must bring back the same window, not make a second one.
await invokeCommand(pet, "open_settings");
await sleep(1000);
const count = (await pages()).filter((t) => pageName(t) === "settings.html").length;
if (count !== 1) throw new Error(`expected one settings window after opening it twice, found ${count}`);
console.log("opening settings again reused the open window");
