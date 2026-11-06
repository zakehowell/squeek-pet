// Helpers for the Windows window checks: they drive Squeek Pet's pages through
// WebView2's DevTools port (--remote-debugging-port=9222). The workflows open
// that port through the machine-wide WebView2 AdditionalBrowserArguments
// policy, because WebView2 ignores WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS for
// elevated apps and GitHub's Windows runners are elevated.

const base = `http://127.0.0.1:${process.env.CDP_PORT ?? 9222}`;
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function withTimeout(promise, seconds, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), seconds * 1000);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** The app's web pages, as listed by WebView2's DevTools endpoint. */
export async function pages() {
  const response = await fetch(`${base}/json/list`);
  return (await response.json()).filter((target) => target.type === "page");
}

export const pageName = (target) => new URL(target.url).pathname.replace(/^\//, "") || "index.html";
export const isApp = (target) => /^(https?|tauri):/.test(target.url);

/** The app's page with this file name, if it is open. */
export async function appPage(name) {
  return (await pages()).find((target) => isApp(target) && pageName(target) === name);
}

export async function waitFor(what, seconds, probe) {
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
export async function evaluate(target, expression, seconds) {
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

/** The pet's page, once its Tauri bridge is ready. */
export function petPage() {
  return waitFor("the pet page did not appear in the DevTools list", 60, async () => {
    const target = await appPage("index.html");
    return target && (await evaluate(target, `typeof window.__TAURI_INTERNALS__?.invoke === "function"`, 5)) ? target : null;
  });
}

/**
 * Invokes one of the app's commands from the pet page, the way its menus do.
 * A command that never returns means the app's main thread is stuck, which is
 * what leaves a new window blank white on Windows.
 */
export async function invokeCommand(pet, command) {
  let result;
  try {
    result = await evaluate(
      pet,
      `window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)}).then(() => "ok", (error) => "error: " + error)`,
      20,
    );
  } catch (error) {
    throw new Error(
      `${command} never returned (${error.message}). The app's main thread is stuck, ` +
        "which is what leaves a new window blank white on Windows.",
    );
  }
  if (result !== "ok") throw new Error(`${command} failed: ${result}`);
}
