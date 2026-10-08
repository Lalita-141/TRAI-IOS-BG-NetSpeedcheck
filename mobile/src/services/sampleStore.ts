import AsyncStorage from '@react-native-async-storage/async-storage';
import { Sample } from '../types';

const STORAGE_KEY_PENDING = '@speedmonitor_pending_samples';
const STORAGE_KEY_HISTORY = '@speedmonitor_history_samples';
const MAX_HISTORY_COUNT = 100;

class SampleStore {
  private pendingCache: Sample[] | null = null;
  private historyCache: Sample[] | null = null;
  private lockPromise: Promise<void> = Promise.resolve();

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
      if (history.length > MAX_HISTORY_COUNT) {
        history.length = MAX_HISTORY_COUNT;
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
   * Returns sample history for the UI
   */
  async getHistory(limit: number = 50): Promise<Sample[]> {
    return this.withLock(async () => {
      const history = await this.loadHistory();
      return history.slice(0, limit);
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
