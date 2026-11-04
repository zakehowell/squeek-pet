// Deterministic randomness. Every random choice in the world is drawn from a
// settlement's own block hash, transaction hash and log index, salted by what
// is being decided, so it is the same on every machine and nobody (not even
// the player) can know it before the settlement lands on Sepolia.

/** cyrb128: four 32-bit hashes of a string. */
function hash128(text: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < text.length; i++) {
    const k = text.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

export interface Rng {
  /** A float in [0, 1). */
  next(): number;
  /** An integer in [min, max]. */
  int(min: number, max: number): number;
  /** True with the given chance in percent. */
  chance(percent: number): boolean;
  pick<T>(items: readonly T[]): T;
  weighted<T>(items: readonly { weight: number; value: T }[]): T;
}

/** sfc32 seeded from a string. */
export function rng(seed: string): Rng {
  let [a, b, c, d] = hash128(seed);
  const next = () => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  // Warm up so similar seeds diverge.
  for (let i = 0; i < 12; i++) next();
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  return {
    next,
    int,
    chance: (percent) => next() * 100 < percent,
    pick: (items) => items[Math.floor(next() * items.length)],
    weighted(items) {
      const total = items.reduce((sum, item) => sum + item.weight, 0);
      let roll = next() * total;
      for (const item of items) {
        roll -= item.weight;
        if (roll < 0) return item.value;
      }
      return items[items.length - 1].value;
    },
  };
}

/** A short one-way digest, for keeping an event's identity without its addresses or hashes. */
export function digest(text: string): string {
  return hash128(text)
    .map((n) => n.toString(16).padStart(8, "0"))
    .join("");
}

/** A stable small number from a string, for picking text variants. */
export function variant(seed: string, count: number): number {
  return hash128(seed)[0] % count;
}

/** Bytes 0..255 from a seed, for drawing dreams. */
export function bytes(seed: string, count: number): number[] {
  const r = rng(`${seed}:bytes`);
  return Array.from({ length: count }, () => Math.floor(r.next() * 256));
}
