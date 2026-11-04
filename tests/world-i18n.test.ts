import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyChoice, replay } from "../src/world/engine";
import { ERROR_KEYS, errorText, hasLine, renderLine, rewards, ui } from "../src/world/i18n";
import { newSim, simTurns } from "../src/world/sim";
import type { ChoiceRecord, LedgerEntry } from "../src/world/types";

const source = (path: string) => readFileSync(new URL(`../src/world/${path}`, import.meta.url), "utf8");

describe("world text", () => {
  it("has English and Chinese text for every diary line the rules write", () => {
    const keys = new Set<string>();
    for (const file of ["engine.ts", "sync.ts"]) {
      for (const match of source(file).matchAll(/k: "(d\.[\w.]+)"/g)) keys.add(match[1]);
    }
    expect(keys.size).toBeGreaterThan(30);
    for (const key of keys) expect(hasLine(key), key).toBe(true);
  });

  it("has text for every reason a choice can be refused", () => {
    const reasons = new Set([...source("engine.ts").matchAll(/"(err\.\w+)"/g)].map((m) => m[1]));
    for (const reason of reasons) {
      expect(ERROR_KEYS, reason).toContain(reason);
      expect(errorText("zh", reason)).not.toBe(reason);
    }
  });

  it("renders a long simulated history without placeholders in both languages", () => {
    const save = newSim(Date.parse("2026-11-04T00:00:00Z"));
    let entries: LedgerEntry[] = [];
    for (let i = 0; i < 30; i++) entries = [...entries, ...simTurns({ ...save, entries }, i % 3 ? "rest" : "active", 6)];
    const choices: ChoiceRecord[] = [
      { seq: 1, at: 0, made: 0, c: { t: "plant", plot: 0, plant: "carrot" } },
      { seq: 2, at: 0, made: 0, c: { t: "expedition", route: "mossy", gear: [], snack: false, charm: false } },
      { seq: 3, at: 0, made: 0, c: { t: "guild", guild: "star", season: 1 } },
    ];
    const world = replay(save.base, entries, choices);
    applyChoice(world, { t: "build", building: "lantern" });
    const lines = world.diary.flatMap((d) => d.lines);
    expect(lines.length).toBeGreaterThan(50);
    for (const lang of ["en", "zh"] as const) {
      for (const line of lines) {
        const text = renderLine(lang, line);
        expect(text, line.k).not.toBe("");
        expect(text, line.k).not.toMatch(/[{}]|undefined|NaN/);
      }
    }
  });

  it("names rewards with measure words in Chinese", () => {
    expect(rewards("zh", "wood:12,crystal:1,seed.carrot:2")).toBe("12 根木材、1 颗星晶、2 包胡萝卜种子");
    expect(rewards("en", "wood:12,crystal:1,seed.carrot:2")).toBe("12 wood, 1 star crystal, 2 carrot seed packets");
    expect(ui("zh", "sync.settled", { n: "1281" })).toBe("已结算到第 1281 轮");
  });
});
