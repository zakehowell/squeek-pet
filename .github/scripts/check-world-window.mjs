// Windows smoke test for the Squeek Pet World window, run by windows.yml.
//
// It opens the World window the way the pet's right-click menu, its tray menu
// and its news toasts do (the pet page invokes the open_world command), then
// checks that the World page rendered with its four tabs, that the new window
// fits the screen's work area, and that opening it again reuses it. Squeek Pet
// must already be running with WebView2's DevTools port open; see webview.mjs.
//
// It also reports whether the real world was founded from the public API, but
// does not fail on that: a slow or busy API is not a fault of the window.

import { appPage, evaluate, invokeCommand, pageName, pages, petPage, sleep, waitFor } from "./webview.mjs";

const pet = await petPage();
console.log(`pet page: ${pet.url}`);
if (await appPage("world.html")) {
  throw new Error("the World window was open before this check opened it");
}

await invokeCommand(pet, "open_world");
console.log("open_world returned");

const world = await waitFor("the World page did not appear", 30, () => appPage("world.html"));
const rendered = await waitFor("the World page did not render", 30, async () => {
  const state = await evaluate(
    world,
    `({
      ready: document.readyState,
      heading: document.querySelector("#world h1")?.textContent ?? "",
      tabs: [...document.querySelectorAll('#world [role="tab"]')].map((tab) => tab.textContent.trim()),
      view: [innerWidth, innerHeight],
      workArea: [screen.availWidth, screen.availHeight],
      background: getComputedStyle(document.body).backgroundColor,
    })`,
    10,
  );
  return state.ready === "complete" && state.heading && state.tabs.length === 4 ? state : null;
});
console.log(`World page: ${world.url}`);
console.log(`  heading "${rendered.heading}", tabs ${rendered.tabs.join(" / ")}, background ${rendered.background}`);
console.log(`  content ${rendered.view.join("×")} in a ${rendered.workArea.join("×")} work area`);
const [width, height] = rendered.view;
const [areaWidth, areaHeight] = rendered.workArea;
if (width > areaWidth || height > areaHeight) {
  throw new Error(`the World window is bigger than the screen's work area (${width}×${height} > ${areaWidth}×${areaHeight})`);
}

// The real world founds itself on the newest settled round once the API answers.
const founded = await waitFor("the real world was not founded", 60, () =>
  evaluate(
    world,
    `(() => {
      const save = JSON.parse(localStorage.getItem("squeek-world:real:v1") ?? "null");
      return save && { frontier: save.base.frontier, turns: save.entries.length };
    })()`,
    10,
  ),
).catch((error) => {
  console.log(`  note: ${error.message}; the World page will retry on its own`);
  return null;
});
if (founded) console.log(`  real world founded on settled round ${founded.frontier}, ${founded.turns} turn(s) since`);
const syncLine = await evaluate(world, `document.querySelector("#world .sync-line")?.textContent ?? ""`, 10);
if (syncLine) console.log(`  sync: ${syncLine}`);

// Opening it again must bring back the same window, not make a second one.
await invokeCommand(pet, "open_world");
await sleep(1000);
const count = (await pages()).filter((t) => pageName(t) === "world.html").length;
if (count !== 1) throw new Error(`expected one World window after opening it twice, found ${count}`);
console.log("opening the World again reused the open window");
