import AsyncStorage from '@react-native-async-storage/async-storage';
import { Sample } from '../types';

const STORAGE_KEY_PENDING = '@speedmonitor_pending_samples';
// Last history list fetched from the server (offline cache). Same key the old
// local-only history used, so existing history becomes the first cached snapshot.
const STORAGE_KEY_HISTORY = '@speedmonitor_history_samples';
// Samples uploaded since the last server snapshot, so they stay visible until the next fetch
const STORAGE_KEY_RECENT = '@speedmonitor_recent_uploaded';
const DEFAULT_MAX_HISTORY_COUNT = 500;

// Caps keep every AsyncStorage write small (background tests only touch these two lists)
const MAX_PENDING = 500;
const MAX_RECENT = 200;

/**
 * History = unsent samples (pending queue) + recently uploaded samples + the
 * last server snapshot, merged newest-first and de-duplicated by id.
 *
 * Background tests only append to the small pending list; the big snapshot is
 * written only when a server fetch succeeds (foreground), never per test.
 */
class SampleStore {
  private pendingCache: Sample[] | null = null;
  private recentCache: Sample[] | null = null;
  private historyCache: Sample[] | null = null;
  private maxHistoryLimit: number = DEFAULT_MAX_HISTORY_COUNT;
  private lockPromise: Promise<void> = Promise.resolve();

  public setMaxHistoryLimit(limit: number): void {
    if (limit && limit > 0) {
      this.maxHistoryLimit = limit;
      // If current cached history exceeds new limit, trim it
      if (this.historyCache && this.historyCache.length > limit) {
        this.historyCache = this.historyCache.slice(0, limit);
        this.saveList(STORAGE_KEY_HISTORY, this.historyCache);
      }
    }
  }

  public getMaxHistoryLimit(): number {
    return this.maxHistoryLimit;
  }

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const nextLock = this.lockPromise.then(async () => {
      return await fn();
    });
    this.lockPromise = nextLock.then(() => {}, () => {});
    return nextLock;
  }

  private async readList(key: string): Promise<Sample[]> {
    try {
      const data = await AsyncStorage.getItem(key);
      if (data) {
        const parsed = JSON.parse(data);
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch (e) {
      console.warn(`Failed to read ${key}`, e);
    }
    return [];
  }

  private async saveList(key: string, samples: Sample[]): Promise<void> {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(samples));
    } catch (e) {
      console.error(`Failed to save ${key}`, e);
    }
  }

  private async loadPending(): Promise<Sample[]> {
    if (this.pendingCache === null) {
      this.pendingCache = await this.readList(STORAGE_KEY_PENDING);
    }
    return this.pendingCache;
  }

  private async savePending(samples: Sample[]): Promise<void> {
    this.pendingCache = samples;
    await this.saveList(STORAGE_KEY_PENDING, samples);
  }

  private async loadRecent(): Promise<Sample[]> {
    if (this.recentCache === null) {
      this.recentCache = await this.readList(STORAGE_KEY_RECENT);
    }
    return this.recentCache;
  }

  private async loadHistory(): Promise<Sample[]> {
    if (this.historyCache === null) {
      this.historyCache = await this.readList(STORAGE_KEY_HISTORY);
    }
    return this.historyCache;
  }

  /** Merged newest-first view; must be called inside the lock. */
  private async buildMergedHistory(): Promise<Sample[]> {
    const pending = await this.loadPending();
    const recent = await this.loadRecent();
    const snapshot = await this.loadHistory();

    const seen = new Set<string>();
    const merged: Sample[] = [];
    const push = (s: Sample, isPending: boolean) => {
      if (!s || !s.id || seen.has(s.id)) return;
      seen.add(s.id);
      merged.push({ ...s, is_pending: isPending });
    };
    pending.forEach(s => push(s, true));
    recent.forEach(s => push(s, false));
    snapshot.forEach(s => push(s, false));

    merged.sort((a, b) => (Number(b.ts) || 0) - (Number(a.ts) || 0));
    return merged;
  }

  /**
   * Adds a new sample to the pending upload queue. It shows in history
   * immediately (marked is_pending) and stays there after upload.
   */
  async add(sample: Sample): Promise<void> {
    return this.withLock(async () => {
      const pending = await this.loadPending();
      const clean = { ...sample };
      delete clean.is_pending;
      pending.push(clean);
      // Long offline period: keep the newest samples only
      if (pending.length > MAX_PENDING) {
        pending.splice(0, pending.length - MAX_PENDING);
      }
      await this.savePending(pending);
    });
  }

  /**
   * Returns up to `count` pending samples for batch uploading
   */
  async getPending(count: number = 20): Promise<Sample[]> {
    return this.withLock(async () => {
      const pending = await this.loadPending();
      return pending.slice(0, count);
    });
  }

  /**
   * Returns count of all currently pending samples
   */
  async getPendingCount(): Promise<number> {
    return this.withLock(async () => {
      const pending = await this.loadPending();
      return pending.length;
    });
  }

  /**
   * Removes successfully uploaded samples by ID from the queue. They move to the
   * small "recently uploaded" list so history keeps showing them until the next
   * server snapshot includes them.
   */
  async remove(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    return this.withLock(async () => {
      const pending = await this.loadPending();
      const uploaded = pending.filter(s => idSet.has(s.id));
      const filtered = pending.filter(s => !idSet.has(s.id));
      await this.savePending(filtered);

      if (uploaded.length > 0) {
        const recent = await this.loadRecent();
        const next = [...uploaded.reverse(), ...recent].slice(0, MAX_RECENT);
        this.recentCache = next;
        await this.saveList(STORAGE_KEY_RECENT, next);
      }
    });
  }

  /**
   * Replaces the offline history cache with the list fetched from the server
   * (newest first). Called only after a successful fetch.
   */
  async saveServerSnapshot(serverSamples: Sample[]): Promise<void> {
    return this.withLock(async () => {
      const snapshot = serverSamples
        .filter(s => s && s.id)
        .map(s => {
          const clean = { ...s };
          delete clean.is_pending;
          return clean;
        })
        .slice(0, this.maxHistoryLimit);
      this.historyCache = snapshot;
      await this.saveList(STORAGE_KEY_HISTORY, snapshot);

      // Recently uploaded samples now covered by the snapshot are no longer needed.
      // Keep the rest (e.g. newer than what the server returned).
      const inSnapshot = new Set(snapshot.map(s => s.id));
      const oldestTs = snapshot.length > 0 ? Number(snapshot[snapshot.length - 1].ts) || 0 : 0;
      const recent = await this.loadRecent();
      const remaining = recent.filter(s => !inSnapshot.has(s.id) && (Number(s.ts) || 0) >= oldestTs);
      if (remaining.length !== recent.length) {
        this.recentCache = remaining;
        await this.saveList(STORAGE_KEY_RECENT, remaining);
      }
    });
  }

  /**
   * Returns history for the UI (pending + uploaded + cached server history),
   * newest first. If limit <= 0 or not provided, returns all of it.
   */
  async getHistory(limit: number = 0): Promise<Sample[]> {
    return this.withLock(async () => {
      const merged = await this.buildMergedHistory();
      return limit > 0 ? merged.slice(0, limit) : merged;
    });
  }

  /**
   * Returns storage capacity information
   */
  async getCapacityInfo(): Promise<{ count: number; maxLimit: number; isFull: boolean; usagePercent: number }> {
    return this.withLock(async () => {
      const count = (await this.buildMergedHistory()).length;
      const maxLimit = this.maxHistoryLimit;
      const isFull = count >= maxLimit;
      const usagePercent = Math.min(100, Math.round((count / maxLimit) * 100));
      return { count, maxLimit, isFull, usagePercent };
    });
  }

  /**
   * Drops the cached server history (e.g. after server-side deletion).
   * Unsent samples in the pending queue are kept.
   */
  async clearSyncedHistory(): Promise<void> {
    return this.withLock(async () => {
      this.recentCache = [];
      this.historyCache = [];
      await Promise.all([
        AsyncStorage.removeItem(STORAGE_KEY_RECENT),
        AsyncStorage.removeItem(STORAGE_KEY_HISTORY),
      ]);
    });
  }

  /**
   * Clears all pending queue and history
   */
  async clearAll(): Promise<void> {
    return this.withLock(async () => {
      this.pendingCache = [];
      this.recentCache = [];
      this.historyCache = [];
      await Promise.all([
        AsyncStorage.removeItem(STORAGE_KEY_PENDING),
        AsyncStorage.removeItem(STORAGE_KEY_RECENT),
        AsyncStorage.removeItem(STORAGE_KEY_HISTORY),
      ]);
    });
  }
}

export const sampleStore = new SampleStore();
