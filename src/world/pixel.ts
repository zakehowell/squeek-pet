// Turns the World's vector drawings (see ./art) into pixel art in the browser,
// so the game matches the pixel style of squeekpulse.xyz without a second set
// of hand-made images to keep in step with the drawings.
//
// Each drawing is rasterized at SUPER times its pixel grid. Every SUPER x SUPER
// block becomes one pixel: solid when a shape covers most of it, a see-through
// pixel in quarter steps for soft glows, shadows and faded drawings, nothing
// otherwise. Colours then snap to a small palette, and the edge of the
// silhouette is darkened like a hand-drawn outline. Results are cached per
// drawing. If a browser will not read an SVG back from a canvas, the caller
// keeps the vector drawing.

export const SUPER = 4;
/** Share of a pixel a solid shape must cover to fill it. */
const SOLID = 0.42;
/** Points less opaque than this belong to a glow, a shadow or a faded drawing. */
const GLOW = 0.85;
/** How much of a glow a block must hold to keep a see-through pixel. */
const SOFT = 0.1;

export interface Grid {
  width: number;
  height: number;
  /** CSS pixels per art pixel when shown at the usual size. */
  scale: number;
}

/**
 * The pixel grid for a drawing: small icons (24-unit drawings) get 16 x 16,
 * larger drawings one pixel per unit. Drawings shown small (`small`) get a
 * 16-pixel-wide grid too, so they stay crisp instead of being shrunk.
 */
export function gridFor(viewWidth: number, viewHeight: number, small = false): Grid {
  if (small || viewWidth <= 24) return { width: 16, height: Math.round((viewHeight * 16) / viewWidth), scale: 1.5 };
  return { width: Math.round(viewWidth), height: Math.round(viewHeight), scale: 2 };
}

const weight = (r: number, g: number, b: number) => [r * 2, g * 4, b * 3] as const;

function distance(a: readonly number[], b: readonly number[]): number {
  const [ar, ag, ab] = weight(a[0], a[1], a[2]);
  const [br, bg, bb] = weight(b[0], b[1], b[2]);
  return (ar - br) ** 2 + (ag - bg) ** 2 + (ab - bb) ** 2;
}

/** A palette of at most `k` colours by median cut: deterministic, and kind to the most used colours. */
export function medianCut(colors: readonly (readonly number[])[], k: number): number[][] {
  if (!colors.length) return [];
  let boxes: (readonly number[])[][] = [colors.slice()];
  while (boxes.length < k) {
    let pick = -1;
    let widest = 0;
    let axis = 0;
    boxes.forEach((box, index) => {
      if (box.length < 2) return;
      for (let c = 0; c < 3; c++) {
        let lo = 255;
        let hi = 0;
        for (const color of box) {
          if (color[c] < lo) lo = color[c];
          if (color[c] > hi) hi = color[c];
        }
        if (hi - lo > widest) {
          widest = hi - lo;
          pick = index;
          axis = c;
        }
      }
    });
    if (pick < 0 || widest < 6) break;
    const sorted = boxes[pick].slice().sort((a, b) => a[axis] - b[axis]);
    const half = sorted.length >> 1;
    boxes = [...boxes.slice(0, pick), sorted.slice(0, half), sorted.slice(half), ...boxes.slice(pick + 1)];
  }
  return boxes.map((box) => {
    const sum = [0, 0, 0];
    for (const color of box) for (let c = 0; c < 3; c++) sum[c] += color[c];
    return sum.map((s) => Math.round(s / box.length));
  });
}

/**
 * Pixel art from a rasterized drawing: `rgba` is `width` x `height` (each a
 * multiple of `superSample`); the result is the grid that is `superSample`
 * times smaller, as RGBA bytes.
 */
export function pixelate(rgba: Uint8ClampedArray, width: number, height: number, superSample = SUPER, colors = 16): Uint8ClampedArray {
  const gw = Math.floor(width / superSample);
  const gh = Math.floor(height / superSample);
  const cells = gw * gh;
  const color: number[][] = new Array(cells);
  const kind = new Uint8Array(cells); // 0 empty, 1 solid, 2 see-through
  const alpha = new Float32Array(cells);
  const area = superSample * superSample;
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      let sumA = 0;
      let soft = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      for (let y = gy * superSample; y < (gy + 1) * superSample; y++) {
        for (let x = gx * superSample; x < (gx + 1) * superSample; x++) {
          const i = (y * width + x) * 4;
          const a = rgba[i + 3] / 255;
          if (!a) continue;
          // Canvas pixels are not premultiplied when read back.
          r += rgba[i] * a;
          g += rgba[i + 1] * a;
          b += rgba[i + 2] * a;
          sumA += a;
          if (a > 0.04 && a < GLOW) soft++;
        }
      }
      const cell = gy * gw + gx;
      if (!sumA) continue;
      const coverage = sumA / area;
      color[cell] = [r / sumA, g / sumA, b / sumA];
      // A shape's own soft edge touches only a few points of a block; a glow fills it.
      const glow = soft * 2 >= area;
      if (glow && coverage < GLOW) {
        const steps = Math.round(Math.min(0.75, coverage * 1.15) * 4) / 4;
        if (coverage > SOFT && steps > 0) {
          kind[cell] = 2;
          alpha[cell] = Math.max(0.25, steps);
        }
      } else if (coverage > SOLID) kind[cell] = 1;
    }
  }

  const used: number[][] = [];
  for (let cell = 0; cell < cells; cell++) if (kind[cell]) used.push(color[cell]);
  const palette = medianCut(used, colors);
  const out = new Uint8ClampedArray(cells * 4);
  const nearest = new Map<string, number[]>();
  for (let cell = 0; cell < cells; cell++) {
    if (!kind[cell]) continue;
    const c = color[cell];
    const key = `${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])}`;
    let snapped = nearest.get(key);
    if (!snapped) {
      snapped = palette.reduce((best, p) => (distance(p, c) < distance(best, c) ? p : best), palette[0]);
      nearest.set(key, snapped);
    }
    let [r, g, b] = snapped;
    if (kind[cell] === 1 && onEdge(kind, cell, gw, gh)) [r, g, b] = outline(r, g, b);
    out.set([r, g, b, kind[cell] === 1 ? 255 : Math.round(alpha[cell] * 255)], cell * 4);
  }
  return out;
}

/** A solid pixel next to an empty one (or the border). See-through pixels do not count as filled. */
function onEdge(kind: Uint8Array, cell: number, gw: number, gh: number): boolean {
  const x = cell % gw;
  const y = (cell - x) / gw;
  if (x === 0 || y === 0 || x === gw - 1 || y === gh - 1) return true;
  return kind[cell - 1] !== 1 || kind[cell + 1] !== 1 || kind[cell - gw] !== 1 || kind[cell + gw] !== 1;
}

/** A darker shade of the same colour for the outline; colours that are already dark stay. */
export function outline(r: number, g: number, b: number): [number, number, number] {
  const light = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (light < 0.32) return [r, g, b];
  const f = light > 0.8 ? 0.62 : 0.7;
  return [Math.round(r * f), Math.round(g * f * 0.96), Math.round(b * f * 0.92)];
}

// ---- In the browser ------------------------------------------------------------

const VIEWBOX = /viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"/;
/** Classes of drawings that are only ever shown small. */
const SMALL = /^<svg class="[^"]*\b(mini-chest|stop-chest|tiny)\b/;
const done = new Map<string, string | null>();
const pending = new Map<string, Promise<string | null>>();

/** The pixel grid one of our drawings is drawn on, or null for markup that is not a drawing. */
export function gridOf(markup: string): Grid | null {
  const match = VIEWBOX.exec(markup);
  return match ? gridFor(Number(match[3]), Number(match[4]), SMALL.test(markup)) : null;
}

/** The pixel version of a drawing if it is ready: a data URL, null when the browser refused, undefined when not made yet. */
export function readyPixelArt(markup: string): string | null | undefined {
  return done.get(markup);
}

/**
 * The pixel version of a drawing, as a PNG data URL, or null if this browser
 * can't make it. `defs` holds the gradients the drawings refer to.
 */
export function pixelArt(markup: string, defs: string): Promise<string | null> {
  if (done.has(markup)) return Promise.resolve(done.get(markup)!);
  let job = pending.get(markup);
  if (!job) {
    job = render(markup, defs).then(
      (url) => url,
      () => null,
    );
    job.then((url) => {
      done.set(markup, url);
      pending.delete(markup);
    });
    pending.set(markup, job);
  }
  return job;
}

async function render(markup: string, defs: string): Promise<string | null> {
  const match = VIEWBOX.exec(markup);
  const open = markup.indexOf(">");
  const close = markup.lastIndexOf("</svg>");
  const grid = gridOf(markup);
  if (!match || !grid || open < 0 || close < 0) return null;
  const width = grid.width * SUPER;
  const height = grid.height * SUPER;
  const body = markup.slice(open + 1, close);
  const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${match.slice(1, 5).join(" ")}" width="${width}" height="${height}"><defs>${defs}</defs>${body}</svg>`;
  const url = URL.createObjectURL(new Blob([source], { type: "image/svg+xml" }));
  try {
    const image = new Image(width, height);
    image.src = url;
    await image.decode();
    const big = document.createElement("canvas");
    big.width = width;
    big.height = height;
    const context = big.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(image, 0, 0, width, height);
    // Throws in a browser that taints canvases with SVG; the vector drawing stays then.
    const pixels = context.getImageData(0, 0, width, height).data;
    const small = document.createElement("canvas");
    small.width = grid.width;
    small.height = grid.height;
    const out = small.getContext("2d");
    if (!out) return null;
    const art = pixelate(pixels, width, height, SUPER, grid.width <= 16 ? 10 : 18);
    const imageData = out.createImageData(grid.width, grid.height);
    imageData.data.set(art);
    out.putImageData(imageData, 0, 0);
    return small.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}
