import AsyncStorage from '@react-native-async-storage/async-storage';
import { Sample } from '../types';

const STORAGE_KEY_PENDING = '@speedmonitor_pending_samples';
const STORAGE_KEY_HISTORY = '@speedmonitor_history_samples';
const DEFAULT_MAX_HISTORY_COUNT = 500;

class SampleStore {
  private pendingCache: Sample[] | null = null;
  private historyCache: Sample[] | null = null;
  private maxHistoryLimit: number = DEFAULT_MAX_HISTORY_COUNT;
  private lockPromise: Promise<void> = Promise.resolve();

  public setMaxHistoryLimit(limit: number): void {
    if (limit && limit > 0) {
      this.maxHistoryLimit = limit;
      // If current cached history exceeds new limit, trim it
      if (this.historyCache && this.historyCache.length > limit) {
        this.historyCache = this.historyCache.slice(0, limit);
        this.saveHistory(this.historyCache);
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

  private async loadPending(): Promise<Sample[]> {
    if (this.pendingCache !== null) return this.pendingCache;
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY_PENDING);
      if (data) {
        this.pendingCache = JSON.parse(data);
        return this.pendingCache || [];
      }
    } catch (e) {
      console.warn('Failed to read pending samples', e);
    }
    this.pendingCache = [];
    return this.pendingCache;
  }

  private async savePending(samples: Sample[]): Promise<void> {
    this.pendingCache = samples;
    try {
      await AsyncStorage.setItem(STORAGE_KEY_PENDING, JSON.stringify(samples));
    } catch (e) {
      console.error('Failed to save pending samples', e);
    }
  }

  private async loadHistory(): Promise<Sample[]> {
    if (this.historyCache !== null) return this.historyCache;
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY_HISTORY);
      if (data) {
        this.historyCache = JSON.parse(data);
        return this.historyCache || [];
      }
    } catch (e) {
      console.warn('Failed to read history samples', e);
    }
    this.historyCache = [];
    return this.historyCache;
  }

  private async saveHistory(samples: Sample[]): Promise<void> {
    this.historyCache = samples;
    try {
      await AsyncStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(samples));
    } catch (e) {
      console.error('Failed to save history samples', e);
    }
  }

  /**
   * Adds a new sample to both the pending queue and the display history
   */
  async add(sample: Sample): Promise<void> {
    return this.withLock(async () => {
      const pending = await this.loadPending();
      pending.push(sample);
      await this.savePending(pending);

      const history = await this.loadHistory();
      history.unshift(sample); // Newest first
      if (history.length > this.maxHistoryLimit) {
        history.length = this.maxHistoryLimit;
      }
      await this.saveHistory(history);
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
   * Removes successfully uploaded samples by ID
   */
  async remove(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    return this.withLock(async () => {
      const pending = await this.loadPending();
      const filtered = pending.filter(s => !idSet.has(s.id));
      await this.savePending(filtered);
    });
  }

  /**
   * Returns sample history for the UI. If limit <= 0 or not provided, returns all history.
   */
  async getHistory(limit: number = 0): Promise<Sample[]> {
    return this.withLock(async () => {
      const history = await this.loadHistory();
      if (limit > 0) {
        return history.slice(0, limit);
      }
      return [...history];
    });
  }

  /**
   * Returns storage capacity information
   */
  async getCapacityInfo(): Promise<{ count: number; maxLimit: number; isFull: boolean; usagePercent: number }> {
    return this.withLock(async () => {
      const history = await this.loadHistory();
      const count = history.length;
      const maxLimit = this.maxHistoryLimit;
      const isFull = count >= maxLimit;
      const usagePercent = Math.min(100, Math.round((count / maxLimit) * 100));
      return { count, maxLimit, isFull, usagePercent };
    });
  }

  /**
   * Clears all pending queue and history
   */
  async clearAll(): Promise<void> {
    return this.withLock(async () => {
      this.pendingCache = [];
      this.historyCache = [];
      await Promise.all([
        AsyncStorage.removeItem(STORAGE_KEY_PENDING),
        AsyncStorage.removeItem(STORAGE_KEY_HISTORY),
      ]);
    });
  }
}

export const sampleStore = new SampleStore();
