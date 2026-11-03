// Windows smoke test for the settings window, run by windows.yml and release.yml.
//
// It opens the settings window the way the pet's right-click menu and its
// details card do (the pet page invokes the open_settings command), then checks
// that the settings page really rendered. Squeek Pet must already be running
// with WebView2's DevTools port open (--remote-debugging-port=9222). The
// workflows set it through the machine-wide WebView2 AdditionalBrowserArguments
// policy, because WebView2 ignores WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS for
// elevated apps and GitHub's Windows runners are elevated.
//
// Squeek Pet 0.1.1 fails this check: open_settings never returns and the new
// window stays blank white, because WebView2 cannot finish creating a webview
// while the main thread is busy running a synchronous command.

const base = `http://127.0.0.1:${process.env.CDP_PORT ?? 9222}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function withTimeout(promise, seconds, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), seconds * 1000);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** The app's web pages, as listed by WebView2's DevTools endpoint. */
async function pages() {
  const response = await fetch(`${base}/json/list`);
  return (await response.json()).filter((target) => target.type === "page");
}

const pageName = (target) => new URL(target.url).pathname.replace(/^\//, "") || "index.html";
const isApp = (target) => /^(https?|tauri):/.test(target.url);

async function waitFor(what, seconds, probe) {
  const deadline = Date.now() + seconds * 1000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await probe();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await sleep(500);
  }
  throw new Error(`${what} within ${seconds} s${lastError ? ` (${lastError.message})` : ""}`);
}

/** Evaluates an expression in a page, waits for it if it is a promise, and returns its value. */
async function evaluate(target, expression, seconds) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  try {
    await withTimeout(
      new Promise((resolve, reject) => {
        socket.onopen = resolve;
        socket.onerror = () => reject(new Error(`could not connect to ${target.url}`));
      }),
      10,
      `could not connect to ${target.url}`,
    );
    const reply = new Promise((resolve, reject) => {
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.id !== 1) return;
        const exception = message.result?.exceptionDetails;
        if (message.error) reject(new Error(message.error.message));
        else if (exception) reject(new Error(exception.exception?.description ?? exception.text));
        else resolve(message.result.result.value);
      };
    });
    socket.send(
      JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true } }),
    );
    return await withTimeout(reply, seconds, `${pageName(target)} did not answer`);
  } finally {
    socket.close();
  }
}

const openSettings = `window.__TAURI_INTERNALS__.invoke("open_settings").then(() => "ok", (error) => "error: " + error)`;

async function invokeOpenSettings(pet) {
  let result;
  try {
    result = await evaluate(pet, openSettings, 20);
  } catch (error) {
    throw new Error(
      `open_settings never returned (${error.message}). The app's main thread is stuck, ` +
        "which is what leaves the settings window blank white on Windows.",
    );
  }
  if (result !== "ok") throw new Error(`open_settings failed: ${result}`);
}

const pet = await waitFor("the pet page did not appear in the DevTools list", 60, async () => {
  const target = (await pages()).find((t) => isApp(t) && pageName(t) === "index.html");
  return target && (await evaluate(target, `typeof window.__TAURI_INTERNALS__?.invoke === "function"`, 5)) ? target : null;
});
console.log(`pet page: ${pet.url}`);
if ((await pages()).some((t) => pageName(t) === "settings.html")) {
  throw new Error("the settings window was open before this check opened it");
}

await invokeOpenSettings(pet);
console.log("open_settings returned");

const settings = await waitFor("the settings page did not appear", 30, async () =>
  (await pages()).find((t) => isApp(t) && pageName(t) === "settings.html"),
);
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
await invokeOpenSettings(pet);
await sleep(1000);
const count = (await pages()).filter((t) => pageName(t) === "settings.html").length;
if (count !== 1) throw new Error(`expected one settings window after opening it twice, found ${count}`);
console.log("opening settings again reused the open window");
