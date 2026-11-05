import type { Language } from "../core/i18n";
import { BusyError, type FetchLike } from "../world/feed";
import { loadSave, safeStorage, worldOf, type StorageLike } from "../world/store";
import { newsOf } from "../world/summary";
import { pull } from "../world/sync";
import type { WorldState } from "../world/types";

// The pet keeps the real Squeek Pet World in step while the World window is
// closed, and tells what the new settled turns brought. It only follows a
// world the player founded by opening Squeek Pet World once; it never founds
// one itself.

export const WORLD_PULL_MS = 120_000;

export interface WorldLinkOptions {
  language(): Language;
  /** Rendered news lines from turns this pull added, oldest first. */
  onNews(texts: string[]): void;
  fetchImpl?: FetchLike;
  storage?: StorageLike | null;
  now?: () => number;
}

export class WorldLink {
  private world: WorldState | null = null;
  private updated: number | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private pulling = false;

  constructor(private readonly options: WorldLinkOptions) {}

  /** The world as last read, or null when none has been founded. */
  get state(): WorldState | null {
    return this.world;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.refresh();
    this.schedule(5_000);
  }

  stop() {
    this.running = false;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Re-reads the save when another window changed it, e.g. a harvest in the World window. */
  refresh(): WorldState | null {
    const save = loadSave("real", this.storage());
    if ((save?.updated ?? null) !== this.updated) {
      this.updated = save?.updated ?? null;
      this.world = save ? worldOf(save) : null;
    }
    return this.world;
  }

  /** One pull; resolves with the delay before the next one. */
  async pullOnce(): Promise<number> {
    if (this.pulling) return WORLD_PULL_MS;
    this.pulling = true;
    try {
      if (!loadSave("real", this.storage())) {
        this.refresh();
        return WORLD_PULL_MS;
      }
      const result = await pull({ fetchImpl: this.options.fetchImpl, storage: this.storage(), now: this.options.now?.() });
      if (result.changed) {
        this.updated = result.save.updated;
        this.world = worldOf(result.save);
        const news = result.founded || result.reorg ? [] : newsOf(this.world, result.added.map((turn) => turn.id), this.options.language());
        if (news.length) this.options.onNews(news);
      } else {
        this.refresh();
      }
      return WORLD_PULL_MS;
    } catch (error) {
      if (error instanceof BusyError) return Math.max(error.retryAfterMs, 15_000);
      console.warn("[squeek-pet] world", error);
      return WORLD_PULL_MS;
    } finally {
      this.pulling = false;
    }
  }

  private storage(): StorageLike | null {
    return this.options.storage === undefined ? safeStorage() : this.options.storage;
  }

  private schedule(delay: number) {
    if (!this.running) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.pullOnce().then((next) => this.schedule(next));
    }, delay);
  }
}
