# Squeek Pet

[中文说明](README.zh-CN.md)

A desktop hamster that moves with **Squeektoshi's real hamster wheel** on SqueekChain (Sepolia testnet).

When the real wheel turns, the pet wakes up and runs at the wheel's measured RPM. New measured work turns into glowing blue data beans that pile up beside the wheel; when the run ends, the pet eats them and burps the exact total. Settled Squeek Blocks pop a gold block. When the data is late or missing, the pet hugs a question mark instead of pretending to sleep.

Normally there is only a small hamster in the corner of the screen. Hover it for a status bubble, double-click for a mini panel.

![Squeektoshi asleep, waking, running, eating, celebrating a settled block, enjoying a head pat, waiting for data, and grumpy](docs/screenshots/hamster.png)

![Demo loop: sleeping, waking, running, eating, settled block, offline](docs/screenshots/demo-loop.png)

> Status: **MVP, version 0.1.0.** On Windows, [download the installer](#windows). On macOS and Linux, [build it from source](#install-from-source), which takes a few minutes. Built and launched on Linux, on an Apple Silicon Mac and on a Windows machine at GitHub. How it looks on real desktops is only partly checked — see [What has been verified](#what-has-been-verified).

## How the real wheel drives the pet

Everything comes from one read-only request, `GET https://api.squeekchain.com/v1/status` (schema version 1), polled every 2 to 10 seconds depending on the performance setting.

| API field | What the pet does |
| --- | --- |
| `measurement.coreStatus` = `ACTIVE` | Wakes up (eyes, ears, shake), hops onto the wheel and runs side-on, looking ahead along the wheel. |
| `measurement.coreStatus` = `IDLE` | Hops off, eats any beans, then lies down in the nest. Hover shows `Zzz…` and "the wheel is still" (a still wheel does not prove the hamster is asleep, and the bubble says so). |
| `measurement.coreStatus` = `COUNTER_FAULT` | Dizzy eyes and a "sensor fault" bubble. |
| `measurement.rpmMilli` | Wheel spin and stride speed, smoothed. Speed lines above about 55 RPM. |
| `measurement.cumulativeWorkUnits` + `counterEpoch` | New work becomes beans (configurable, default 10 work units per bean). A new epoch or a counter that goes backwards only re-baselines; nothing is counted twice and work done before launch is not counted. |
| `measurement.freshness`, `receivedAt`, `staleAfterSeconds` | Older than `staleAfterSeconds` (120 s) or `stale` → offline pet with a question mark, never sleep. Uses the server clock (`generatedAt`) so a wrong local clock does not matter. |
| `measurement` = `null` | Offline: "the API has no wheel reading yet". |
| `measurement.provenance` ≠ `hardware` | The pet always wears a label (SIMULATED, REPLAY, DERIVED). |
| `builder.anchor.blockHeight` | A rise in the **settled** height plays the gold-block celebration and links the transaction. `builder.projected` is never used. |
| HTTP 429 / 503 | Waits for `Retry-After`, otherwise backs off exponentially (up to 60 s). |
| `schemaVersion` ≠ 1 | Stops and asks for an update instead of guessing. |

Requests are plain GETs, so the browser engine sends no CORS preflight. Conditional requests (`If-None-Match`) are not used, because they would trigger a preflight; the API's 1-second shared cache keeps polling cheap. Because of that, a 304 cannot happen.

### Pet states

`loading → sleeping ⇄ waking → running → stopping → eating → sleeping`, plus `offline` and `fault`, which can interrupt any state. The real wheel decides the state; user interactions are short overlays that never change it. A settled-block celebration plays on top of whatever the pet is doing, then it carries on.

### Interactions

| You | The pet |
| --- | --- |
| Hover | Looks at the pointer, shows the status bubble (and `Zzz…` when asleep). |
| Move the pointer nearby | Eyes follow it. |
| Click | Blinks, a little note, squeaks if sounds are on. |
| Four quick clicks | Gets grumpy for a moment. |
| Rub back and forth over the head | Happy eyes and a heart (head pat). |
| Drag | Moves the pet; the position is remembered, including on a second screen. |
| Double-click | Mini panel: wheel, speed, today's distance, measured work, work since launch, settled blocks with a transaction link. |
| Right-click | Menu: details, size (50% to 150%, or a custom size in Settings), sounds, demo mode, Squeek Pulse, settings, hide, quit. |
| Tray / menu bar icon | Show or hide, details, demo mode, settings, quit. |

Everything outside the hamster, wheel and nest is click-through, so the pet never blocks the apps underneath.

### Settings

Language (English / 中文, defaults to the system language), pet size (a slider from 40% to 150% in 5% steps, 75% by default; below 80% only the pet shrinks, so bubbles and the panel stay readable), animation performance (Eco 15 fps / Balanced 30 fps / Smooth 60 fps, which also sets the poll interval), work units per bean, always on top, launch at startup, sounds (off by default), activity notifications, and demo mode.

![Settings window](docs/screenshots/settings.png)

### Demo mode

A scripted 60-second loop for trying the animations while the real hamster rests. Demo data is labelled `DEMO` on the pet and in every bubble, never links a transaction, and runs in a separate state machine, so it can never mix with live totals.

## Safety and privacy

- Read-only: one public API, no wallet connection, no private keys, no signing, no transactions.
- No accounts, analytics or personal data. Settings stay in local storage on the device.
- Links open only Squeek Pulse, the SqueekChain docs and the Sepolia explorer (`eth-sepolia.blockscout.com`), enforced by the app's capability file.
- API values reach the screen only as text, never as HTML.

## Windows

1. Open the [latest release](https://github.com/zakehowell/squeek-pet/releases/latest) and download the file ending in `-setup.exe` (the `.msi` works too). For 64-bit Windows 10 and 11.
2. Run it. The installers are not code-signed, so the first time Windows SmartScreen says "Windows protected your PC": click **More info**, then **Run anyway**.
3. The hamster appears above the taskbar in the bottom-right corner. Its menu is the Squeek Pet icon in the notification area (click `^` if Windows hides it there). Uninstall it from Settings → Apps.

The installers are built by [GitHub Actions](.github/workflows/release.yml) from the source in this repository, at the commit the release points to; nobody builds them by hand. To check a download, compare it with `SHA256SUMS.txt` in the release, or run `gh attestation verify <file> --repo zakehowell/squeek-pet`.

If Windows 11's Smart App Control is on, it blocks unsigned apps outright and offers no "Run anyway", so the installer won't run there.

## Install from source

You build the app on your own computer. An app you build yourself is not quarantined, so macOS opens it without the "unidentified developer" warning.

**1. Install the tools once**

- [Node.js](https://nodejs.org/) 20.19 or newer.
- [Rust](https://www.rust-lang.org/tools/install) (stable), via rustup.
- macOS: Xcode Command Line Tools, `xcode-select --install`.
- Linux: the WebKitGTK packages listed in the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).
- Windows: the Microsoft C++ Build Tools with "Desktop development with C++", and WebView2 (already part of Windows 11 and of up-to-date Windows 10), as in the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/). Most people should use the [installer](#windows) instead.

**2. Download and build**

```bash
git clone https://github.com/zakehowell/squeek-pet.git
cd squeek-pet
npm ci
npm run desktop:build
```

The first build downloads and compiles the Rust crates, so allow a few minutes. On an Apple Silicon Mac a release build took about 80 seconds. On a Mac, `npm run desktop:build -- --bundles app` builds only the app and skips the `.dmg`.

**3. Open it**

- macOS: `src-tauri/target/release/bundle/macos/Squeek Pet.app`. Drag it into Applications. A `.dmg` is in `src-tauri/target/release/bundle/dmg/`.
- Linux: the packages are in `src-tauri/target/release/bundle/` (`deb`, `rpm`, `appimage`).
- Windows: the installers are in `src-tauri\target\release\bundle\nsis\` and `msi\`.

The pet appears in the bottom-right corner of the screen. Quit it from the tray or menu-bar icon.

To update later: `git pull`, then `npm ci` and `npm run desktop:build` again.

### For developers

```bash
npm test               # unit tests (state machine, API parsing, ledger, texts)
npm run typecheck      # strict TypeScript, app and tests
npm run dev            # browser preview at http://127.0.0.1:1420 (?demo=1, ?lang=zh)
npm run desktop        # the real desktop pet, in development mode
```

`http://127.0.0.1:1420/preview.html` shows every pose side by side, replayed through the real state machine.

![All poses](docs/screenshots/poses.png)

Nothing is code-signed. The Windows installers trigger SmartScreen the first time, as described [above](#windows). If you copy a Mac app you built to someone else's computer, macOS blocks it the first time (on macOS 15 and later, System Settings → Privacy & Security → Open Anyway; on earlier versions, right-click → Open). Building from source on each computer avoids this.

## What has been verified

| Check | Result |
| --- | --- |
| Unit tests (Vitest) | 81 passing: API parsing and validation, Retry-After, backoff, state machine transitions, bean ledger (epochs, resets, caps), offline and clock-skew rules, demo loop, bubble and panel texts in both languages, settings and the pet size layout, the parts of the hamster drawing that the animation needs, the head turning to profile while running, and the Wake and Feed reactions, which leave the data untouched. |
| Type checks | `tsc` strict, app and tests. |
| Live API | Pet page read the real `/v1/status` on 2026-10-31 (wheel idle, work 62,576, settled block #5,570) and showed it correctly in both languages. |
| Animations | Every state captured frame by frame through the demo loop. |
| Desktop build on Linux | `cargo build` and `clippy` clean; the app launched on a virtual X display, placed itself bottom-right and showed the sleeping pet on live data (Linux WebKit, the same engine family as macOS). |
| Desktop build on macOS | On an Apple Silicon Mac (macOS 26.6): the unit tests and type checks passed, `npm run desktop` compiled in about a minute and launched with no errors, and on 2026-11-01 a release build produced the `.app` (4.1 MiB) and `.dmg` (2.9 MiB) in 79 seconds. The same day a fresh clone of this repository went through `npm ci`, the tests, the type checks and an app-only build in 89 seconds. |
| Desktop build on Windows | On 2026-11-02 GitHub Actions built this repository on Windows Server 2025 (build 26100, the same build as Windows 11 24H2): the 81 unit tests passed, and a 4 min 34 s release build produced the `-setup.exe` (1.3 MiB) and the `.msi` (1.9 MiB). The `-setup.exe` installed silently, the pet started and was still running 30 seconds later, and a screenshot showed the sleeping hamster above the taskbar in the bottom-right corner, with the desktop visible through its transparent window. This check runs again for every change. |
| **Not verified yet** | On macOS, what the pet looks like on screen: transparency over the desktop, click-through, drag and the menu bar icon. On Windows, anything done by hand: click-through, drag, the menus and tray icon, bubbles and the details panel, SmartScreen on a real PC, installing from the `.msi`, and Windows 10. Multi-monitor and mixed DPI. Autostart. |

## Project layout

```
src/core/        API client, schema validation, poller, state machine, demo loop, settings, i18n
src/pet/         director (state → pose each frame), bubble/panel/toast texts, HUD
src/art/         the hamster drawing, the SVG scene around it, and the rig that animates them
src/platform/    the only place that talks to the desktop shell
src-tauri/       Rust shell: transparent window, click-through, tray, settings window
tests/           Vitest suites and a captured live API response
```

## Recording a demo

The strongest 15-second clip shows three moments: the real wheel starts and the pet wakes and runs; the run produces beans that fly into the dish; the wheel stops and the pet eats, burps the total, and lies down with `Zzz…` on hover.

1. Put Squeek Pet on a clean desktop at 100% size or larger and turn on sounds.
2. Open [Squeek Pulse](https://squeekpulse.xyz/) next to it, so viewers can see the same live reading.
3. Record when Squeektoshi is active. If the hamster is resting, use demo mode for rehearsal only, and keep the DEMO label visible in anything you publish.

## Not in this version

Recording clips from the app, a do-not-disturb mode for full-screen apps, random idle wandering, extra skins, and OS-level notifications.

## License

Squeek Pet's code and artwork, including the hamster, the wheel, bowl and bed around it, and the app icon, are original and licensed under [MIT](LICENSE). No SqueekChain artwork is included. SqueekChain names, trademarks, documentation and API remain subject to their owners' terms and are not relicensed here.
