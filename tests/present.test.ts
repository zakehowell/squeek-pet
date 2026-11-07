import { describe, expect, it } from "vitest";
import { PetMachine, type Effect } from "../src/core/pet-machine";
import { demoSnapshot } from "../src/core/demo";
import { readFileSync } from "node:fs";
import { DOCS_URL, EXPLORER, PULSE_URL, WORLD_URL, badgeFor, bubbleContent, panelContent, petLabel, toastContent } from "../src/pet/present";
import { T0, snap, type SnapOptions } from "./helpers";

function machineWith(...readings: SnapOptions[]) {
  const machine = new PetMachine(T0);
  const effects: Effect[] = [];
  readings.forEach((options, i) => {
    const at = T0 + i * 1000;
    effects.push(...machine.dispatch({ type: "snapshot", snapshot: snap({ ...options, at }), at }));
  });
  return { machine, effects, now: T0 + readings.length * 1000 };
}

const toastOf = (effects: Effect[], key: string) =>
  effects.find((e): e is Extract<Effect, { type: "toast" }> => e.type === "toast" && e.key === key)!;

describe("badges", () => {
  it("marks live hardware as LIVE and adds no tag on the pet", () => {
    const { machine } = machineWith({ core: "IDLE" });
    expect(badgeFor(machine.state, "en")).toEqual({ text: "LIVE", tone: "live" });
    expect(petLabel(machine.state, "en")).toBeNull();
  });

  it("always labels simulated, replayed and demo data", () => {
    expect(petLabel(machineWith({ core: "IDLE", provenance: "simulated" }).machine.state, "en")).toBe("SIMULATED");
    expect(petLabel(machineWith({ core: "IDLE", provenance: "replay" }).machine.state, "zh")).toBe("回放");
    const demo = new PetMachine(T0);
    demo.dispatch({ type: "snapshot", snapshot: demoSnapshot(T0, T0), at: T0 });
    expect(petLabel(demo.state, "en")).toBe("DEMO");
  });

  it("shows OFFLINE instead of a live badge when data is stale", () => {
    const { machine } = machineWith({ core: "IDLE" }, { core: "IDLE", freshness: "stale" });
    expect(badgeFor(machine.state, "en")).toEqual({ text: "OFFLINE", tone: "offline" });
  });
});

describe("hover bubble", () => {
  it("says the wheel is still, not that the hamster sleeps", () => {
    const { machine, now } = machineWith({ core: "IDLE", work: 1000n }, { core: "IDLE", work: 1000n });
    const bubble = bubbleContent(machine.state, now, "en");
    expect(bubble.status).toBe("Zzz… the wheel is still");
    expect(bubble.note).toContain("only says the wheel is idle");
    expect(bubble.rows.map((r) => r.label)).toEqual(["Today", "Work", "Sync"]);
    expect(bubble.foot).toBe("Source: Hardware · Sepolia");
  });

  it("shows RPM, speed and work since launch while running", () => {
    const { machine, now } = machineWith({ core: "ACTIVE", rpm: 78.2, work: 1000n }, { core: "ACTIVE", rpm: 78.2, work: 1120n });
    const bubble = bubbleContent(machine.state, now, "en");
    expect(bubble.status).toBe("78.2 RPM");
    expect(bubble.rows).toContainEqual({ label: "Work", value: "+120 since launch" });
    expect(bubble.rows[0].label).toBe("Speed");
  });

  it("explains why it is offline and when the last reading was", () => {
    const { machine, now } = machineWith({ core: "IDLE" }, { core: "IDLE", freshness: "stale" });
    const bubble = bubbleContent(machine.state, now, "zh");
    expect(bubble.status).toBe("等待跑轮数据");
    expect(bubble.note).toBe("最近的跑轮读数已过期");
    expect(bubble.rows.at(-1)?.label).toBe("同步");
  });
});

describe("toasts", () => {
  it("links settled blocks to the explorer", () => {
    const { machine, effects } = machineWith({ core: "IDLE", height: 4135n }, { core: "IDLE", height: 4143n });
    const toast = toastContent(toastOf(effects, "blocks"), machine.state, "en");
    expect(toast.text).toBe("+8 Squeek Blocks settled on Sepolia · #4143");
    expect(toast.tone).toBe("gold");
    expect(toast.action?.url).toMatch(/^https:\/\/eth-sepolia\.blockscout\.com\/tx\/0x[0-9a-f]{64}$/);
  });

  it("names the data label when a non-hardware feed starts running", () => {
    const { machine, effects } = machineWith({ core: "IDLE", provenance: "replay" }, { core: "ACTIVE", rpm: 50, provenance: "replay" });
    const toast = toastContent(toastOf(effects, "startedRunningLabelled"), machine.state, "en");
    expect(toast.text).toBe("Squeektoshi is running! ⚡ (REPLAY data)");
  });

  it("formats the exact meal total", () => {
    const { machine } = machineWith({ core: "IDLE" });
    const toast = toastContent({ type: "toast", key: "meal", values: { n: "12345" } }, machine.state, "en");
    expect(toast).toEqual({ text: "Nom! +12,345 measured work units", tone: "blue", action: null });
  });
});

describe("mini panel", () => {
  it("lists the reading, settlement and a transaction link for live data", () => {
    const { machine, now } = machineWith({ core: "IDLE", work: 45957n });
    const panel = panelContent(machine.state, now, "en");
    expect(panel.rows.map((r) => r.label)).toEqual([
      "Wheel",
      "Speed",
      "Today's distance",
      "Measured work",
      "Since launch",
      "Settled Squeek Blocks",
    ]);
    expect(panel.reading).toMatch(/^Reading \d\d:\d\d:\d\d · /);
    expect(panel.rows.find((r) => r.label === "Measured work")?.value).toBe("45,957");
    expect(panel.tx?.url).toContain("/tx/0x");
  });

  it("never links a demo transaction", () => {
    const demo = new PetMachine(T0);
    demo.dispatch({ type: "snapshot", snapshot: demoSnapshot(T0, T0), at: T0 });
    const panel = panelContent(demo.state, T0, "en");
    expect(panel.tx).toBeNull();
    expect(panel.source).toBe("Source: local demo loop. Not real data.");
  });
});

describe("links", () => {
  it("opens Squeek Pet World on its own site, and the opener allows every page the pet links", () => {
    expect(WORLD_URL).toBe("https://world.squeekpulse.xyz/");
    const capability = JSON.parse(readFileSync(new URL("../src-tauri/capabilities/default.json", import.meta.url), "utf8"));
    const opener = capability.permissions.find((p: unknown) => typeof p === "object" && (p as { identifier: string }).identifier === "opener:allow-open-url");
    const allowed: string[] = opener.allow.map((entry: { url: string }) => entry.url);
    const allows = (url: string) => allowed.some((pattern) => (pattern.endsWith("/*") ? url.startsWith(pattern.slice(0, -1)) : url === pattern));
    for (const url of [PULSE_URL, WORLD_URL, DOCS_URL, `${EXPLORER}/tx/0x01`]) expect(allows(url), url).toBe(true);
    expect(allows("https://world.squeekpulse.xyz.example/"), "only the World's own host").toBe(false);
  });
});
