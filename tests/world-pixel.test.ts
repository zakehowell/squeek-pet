import { describe, expect, it } from "vitest";
import { itemIcon, MARKS, npcPortrait, resIcon, seedIcon } from "../src/world/art/icons";
import { areaArt, bossArt, buildingArt, chestArt, guildCrest, plantArt } from "../src/world/art/world-art";
import { AREA_ORDER, BOSSES, BUILDING_ORDER, CONSUMABLES, GEAR, GUILD_ORDER, NPCS, PLANT_ORDER, RESOURCES } from "../src/world/data";
import type { NpcId } from "../src/world/types";
import { gridFor, gridOf, medianCut, outline, pixelate, SUPER } from "../src/world/pixel";
import { arrowStep } from "../src/world/ui/dom";

/** An RGBA image `cells` x `cells` art pixels across, `SUPER` points per pixel, filled by `paint(x, y)`. */
function image(cells: number, paint: (x: number, y: number) => [number, number, number, number] | null) {
  const size = cells * SUPER;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const p = paint(x, y);
      if (p) data.set(p, (y * size + x) * 4);
    }
  }
  return { data, size };
}

const pixel = (out: Uint8ClampedArray, cells: number, x: number, y: number) => Array.from(out.slice((y * cells + x) * 4, (y * cells + x) * 4 + 4));

describe("pixel grid", () => {
  it("draws 24-unit icons on 16 pixels and larger drawings one pixel per unit", () => {
    expect(gridFor(24, 24)).toEqual({ width: 16, height: 16, scale: 1.5 });
    expect(gridFor(24, 30)).toEqual({ width: 16, height: 20, scale: 1.5 });
    expect(gridFor(120, 80)).toEqual({ width: 120, height: 80, scale: 2 });
    expect(gridFor(100, 60, true)).toEqual({ width: 16, height: 10, scale: 1.5 });
  });

  it("reads the grid from a drawing's viewBox and class", () => {
    expect(gridOf('<svg class="ico" viewBox="0 0 24 24"></svg>')).toEqual({ width: 16, height: 16, scale: 1.5 });
    expect(gridOf('<svg class="chest-art tiny" viewBox="0 0 64 48"></svg>')).toEqual({ width: 16, height: 12, scale: 1.5 });
    expect(gridOf('<svg class="chest-art" viewBox="0 0 64 48"></svg>')).toEqual({ width: 64, height: 48, scale: 2 });
    expect(gridOf("<span>not a drawing</span>")).toBeNull();
  });

  it("finds a grid for every drawing the World shows", () => {
    const drawings = [
      ...Object.values(MARKS),
      ...RESOURCES.map((id) => resIcon(id)),
      ...[...GEAR, ...CONSUMABLES].map((id) => itemIcon(id)),
      ...PLANT_ORDER.flatMap((id) => [seedIcon(id), plantArt(id, 0), plantArt(id, 3, true)]),
      plantArt(null, 0),
      ...(Object.keys(NPCS) as NpcId[]).map((id) => npcPortrait(id)),
      ...BUILDING_ORDER.flatMap((id) => [buildingArt(id, 0), buildingArt(id, 1), buildingArt(id, 3)]),
      ...AREA_ORDER.map((id) => areaArt(id)),
      ...BOSSES.map((boss) => bossArt(boss.id)),
      ...GUILD_ORDER.flatMap((id) => [guildCrest(id), guildCrest(id, "crest tiny")]),
      ...(["bronze", "silver", "gold", "rainbow", null] as const).flatMap((tier) => [chestArt(tier), chestArt(tier, true), chestArt(tier, false, "chest-art tiny")]),
    ];
    expect(drawings.length).toBeGreaterThan(80);
    for (const markup of drawings) expect(gridOf(markup), markup.slice(0, 60)).not.toBeNull();
  });
});

describe("pixelate", () => {
  it("fills covered pixels, darkens the silhouette's edge and keeps the inside colour", () => {
    const { data, size } = image(3, () => [200, 120, 40, 255]);
    const out = pixelate(data, size, size);
    expect(pixel(out, 3, 1, 1)).toEqual([200, 120, 40, 255]);
    expect(pixel(out, 3, 0, 0)).toEqual([...outline(200, 120, 40), 255]);
  });

  it("leaves empty pixels empty", () => {
    const { data, size } = image(2, () => null);
    expect(Array.from(pixelate(data, size, size)).every((v) => v === 0)).toBe(true);
  });

  it("needs a solid shape to cover most of a pixel", () => {
    // 7 of 16 points covered fills the pixel; 6 of 16 does not.
    const covered = (n: number) => image(1, (x, y) => (y * SUPER + x < n ? [10, 10, 10, 255] : null));
    const seven = covered(7);
    const six = covered(6);
    expect(pixelate(seven.data, seven.size, seven.size)[3]).toBe(255);
    expect(pixelate(six.data, six.size, six.size)[3]).toBe(0);
  });

  it("turns a soft glow into a see-through pixel in quarter steps", () => {
    const { data, size } = image(1, () => [255, 230, 120, 128]);
    const out = pixelate(data, size, size);
    expect(out[3]).toBe(128);
    // Brighter than an outline: see-through pixels are never edge-darkened.
    expect(Array.from(out.slice(0, 3))).toEqual([255, 230, 120]);
  });

  it("drops a glow too faint to see", () => {
    const { data, size } = image(1, () => [255, 255, 255, 20]);
    expect(pixelate(data, size, size)[3]).toBe(0);
  });

  it("snaps colours to a palette of the requested size", () => {
    // Six pixels across; the four inside ones (not on the edge) each get a different red.
    const reds = [40, 90, 160, 230];
    const { data, size } = image(6, (x, y) => {
      const cx = Math.floor(x / SUPER);
      const cy = Math.floor(y / SUPER);
      const inside = cx > 0 && cx < 5 && cy > 0 && cy < 5;
      return [inside ? reds[(cx + cy) % 4] : 20, 30, 30, 255];
    });
    const out = pixelate(data, size, size, SUPER, 2);
    const colours = new Set<string>();
    for (let y = 2; y < 4; y++) for (let x = 2; x < 4; x++) colours.add(pixel(out, 6, x, y).join(","));
    expect(colours.size).toBeLessThanOrEqual(2);
  });
});

describe("palette", () => {
  it("is empty for no colours and one colour for one", () => {
    expect(medianCut([], 4)).toEqual([]);
    expect(medianCut([[9, 9, 9], [9, 9, 9], [10, 9, 9]], 4)).toHaveLength(1);
  });

  it("splits clearly different colours and keeps their averages", () => {
    const greens = Array.from({ length: 10 }, () => [30, 200, 60]);
    const purples = Array.from({ length: 10 }, () => [150, 60, 220]);
    const palette = medianCut([...greens, ...purples], 2).map((c) => c.join(","));
    expect(palette.sort()).toEqual(["150,60,220", "30,200,60"]);
  });

  it("never returns more colours than asked for", () => {
    const colours = Array.from({ length: 200 }, (_, i) => [(i * 37) % 256, (i * 91) % 256, (i * 13) % 256]);
    expect(medianCut(colours, 6).length).toBeLessThanOrEqual(6);
  });
});

describe("outline", () => {
  it("keeps dark colours and darkens light ones", () => {
    expect(outline(20, 30, 40)).toEqual([20, 30, 40]);
    const [r, g, b] = outline(240, 220, 200);
    expect(r).toBeLessThan(240);
    expect(g).toBeLessThan(220);
    expect(b).toBeLessThan(200);
  });
});

describe("tab keys", () => {
  const tabs = ["home", "adventure", "log", "guild"] as const;
  it("moves with the arrows and wraps around", () => {
    expect(arrowStep("ArrowRight", tabs, "home")).toBe("adventure");
    expect(arrowStep("ArrowLeft", tabs, "home")).toBe("guild");
    expect(arrowStep("ArrowRight", tabs, "guild")).toBe("home");
    expect(arrowStep("Home", tabs, "log")).toBe("home");
    expect(arrowStep("End", tabs, "home")).toBe("guild");
  });

  it("ignores other keys", () => {
    expect(arrowStep("Enter", tabs, "home")).toBeNull();
    expect(arrowStep("a", tabs, "home")).toBeNull();
  });
});
