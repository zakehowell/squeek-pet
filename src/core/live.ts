// Where "watch live" goes. @squeekchain broadcasts Squeektoshi's wheel on X,
// and every broadcast gets a new address, so nothing here hardcodes one.
//
// Squeek Chain publishes the current broadcast in a small descriptor file
// (the one squeekchain.com reads). When the descriptor can be read and says
// an X broadcast is live, the button opens that broadcast directly. In every
// other case it opens the @squeekchain profile, one click away from the
// current stream. The descriptor currently only answers squeekchain.com's own
// origin, so until Squeek Chain allows the app it always falls back.

export const LIVE_HANDLE = "squeekchain";
export const LIVE_PROFILE_URL = `https://x.com/${LIVE_HANDLE}`;
export const LIVE_DESCRIPTOR_URL = "https://media.squeekchain.com/live/current.json";

/** Same shape squeekchain.com accepts for an X broadcast id. */
const BROADCAST_ID = /^[A-Za-z0-9]{13,16}$/;
/** How long one descriptor reading is trusted before it is read again. */
const REFRESH_MS = 30_000;
const TIMEOUT_MS = 4_000;

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface LiveBroadcast {
  url: string;
  validUntil: number;
}

/**
 * Reads a live descriptor (schema 2). Only a live X broadcast whose
 * validity window has not ended counts; anything else, malformed or not,
 * is null, which means "use the profile".
 */
export function liveBroadcast(descriptor: unknown, now: number): LiveBroadcast | null {
  if (!descriptor || typeof descriptor !== "object") return null;
  const d = descriptor as Record<string, unknown>;
  if (d.schemaVersion !== 2 || d.state !== "live") return null;
  const playback = d.playback as Record<string, unknown> | null;
  if (!playback || playback.kind !== "x" || typeof playback.broadcastId !== "string") return null;
  if (!BROADCAST_ID.test(playback.broadcastId)) return null;
  const validUntil = typeof d.validUntil === "string" ? Date.parse(d.validUntil) : NaN;
  if (!Number.isFinite(validUntil) || validUntil <= now) return null;
  return { url: `https://x.com/i/broadcasts/${playback.broadcastId}`, validUntil };
}

/**
 * Keeps the best known live address. `refresh()` is cheap to call often: it
 * reads the descriptor at most every 30 s. `url()` never waits, so a click
 * opens a page at once.
 */
export function createLiveLink(fetchImpl: FetchLike = (input, init) => fetch(input, init), descriptorUrl = LIVE_DESCRIPTOR_URL) {
  let broadcast: LiveBroadcast | null = null;
  let checkedAt = -Infinity;
  let pending: Promise<void> | null = null;

  async function read(now: number) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetchImpl(descriptorUrl, { cache: "no-store", credentials: "omit", signal: controller.signal });
      broadcast = response.ok ? liveBroadcast(await response.json(), now) : null;
    } catch {
      // Blocked, offline or not JSON: the profile link still works.
      broadcast = null;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    refresh(now = Date.now()): Promise<void> {
      if (pending) return pending;
      if (now - checkedAt < REFRESH_MS) return Promise.resolve();
      checkedAt = now;
      pending = read(now).finally(() => {
        pending = null;
      });
      return pending;
    },
    url(now = Date.now()): string {
      return broadcast && broadcast.validUntil > now ? broadcast.url : LIVE_PROFILE_URL;
    },
  };
}
