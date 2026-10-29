import { useEffect, useState } from 'react';
import { AppState, NativeModules, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  ScheduledTestConfig,
  ScheduleFrequency,
} from '../components/ScheduledTestSetupView';
import { Sample } from '../types';
import { getConfig, getDeviceId } from '../config';
import { generateUUID } from '../utils/uuid';
import { sampleStore } from './sampleStore';
import { uploader } from './uploader';
import { speedTester } from './speedTester';
import { locationService } from './locationService';
import { testCoordinator, TestOwner } from './testCoordinator';

const STORAGE_KEY_SCHEDULE = '@speedmonitor_scheduled_test';

// How often the JS side checks for a due run while the app process is alive
// (foreground, or kept alive in background by monitoring / continuous test).
const CHECK_INTERVAL_MS = 60 * 1000;

// A full speed test finished by another feature this recently satisfies the
// scheduled run instead of running a duplicate test.
const COLLAPSE_WINDOW_MS = 2 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ScheduleState {
  config: ScheduledTestConfig | null;
  lastRunPeriod: number | null;
  lastRunAt: number | null; // ms
  runCount: number;
  lastOutcome: string | null;
  isRunning: boolean;
}

type ScheduleListener = (state: ScheduleState) => void;

const EMPTY_STATE: ScheduleState = {
  config: null,
  lastRunPeriod: null,
  lastRunAt: null,
  runCount: 0,
  lastOutcome: null,
  isRunning: false,
};

const OWNER_LABELS: Record<TestOwner, string> = {
  monitor: 'background monitor',
  manual: 'manual speed',
  continuous: 'continuous',
  scheduled: 'scheduled',
};

const startOfDay = (ts: number) => {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/**
 * Index of the schedule period containing `now`: one run per calendar day,
 * per 7-day block counted from the start date, or per calendar month.
 * Must stay in sync with NativeMonitorService.schedulePeriodIndex (iOS).
 */
export function schedulePeriodIndex(frequency: ScheduleFrequency, fromTs: number, now: number): number {
  if (frequency === 'monthly') {
    const from = new Date(fromTs);
    const cur = new Date(now);
    return cur.getFullYear() * 12 + cur.getMonth() - (from.getFullYear() * 12 + from.getMonth());
  }
  const days = Math.round((startOfDay(now) - startOfDay(fromTs)) / DAY_MS);
  return frequency === 'weekly' ? Math.floor(days / 7) : days;
}

function periodStart(frequency: ScheduleFrequency, fromTs: number, index: number): number {
  const from = new Date(startOfDay(fromTs));
  if (frequency === 'monthly') {
    return new Date(from.getFullYear(), from.getMonth() + index, 1).getTime();
  }
  const d = new Date(from);
  d.setDate(d.getDate() + (frequency === 'weekly' ? index * 7 : index));
  return d.getTime();
}

function withTimestamps(config: ScheduledTestConfig): ScheduledTestConfig {
  const fromTs = config.fromTs ?? startOfDay(Date.now());
  const toTs = config.toTs ?? startOfDay(Date.now()) + 8 * DAY_MS - 1;
  return { ...config, fromTs, toTs };
}

/** Earliest time the next scheduled run may happen, or null if the schedule is over. */
export function getNextRunAt(state: ScheduleState, now: number = Date.now()): number | null {
  const config = state.config;
  if (!config || config.fromTs == null || config.toTs == null) return null;
  if (now > config.toTs) return null;
  if (now < config.fromTs) return config.fromTs;
  const idx = schedulePeriodIndex(config.frequency, config.fromTs, now);
  if (state.lastRunPeriod !== idx) return now;
  const next = periodStart(config.frequency, config.fromTs, idx + 1);
  return next <= config.toTs ? next : null;
}

function nativeBridge() {
  const bridge = NativeModules.NativeMonitorBridge;
  return Platform.OS === 'ios' && bridge ? bridge : null;
}

class ScheduledTestService {
  private state: ScheduleState = { ...EMPTY_STATE };
  private listeners: Set<ScheduleListener> = new Set();
  private initPromise: Promise<void> | null = null;
  private checking = false;
  private timer: any = null;

  getState(): ScheduleState {
    return this.state;
  }

  subscribe(listener: ScheduleListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Loads the saved schedule and starts due-checks. Safe to call repeatedly. */
  init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        await this.load();
        await this.syncFromNative();

        this.timer = setInterval(() => {
          this.checkAndRun();
        }, CHECK_INTERVAL_MS);

        AppState.addEventListener('change', nextState => {
          if (nextState === 'active') {
            this.syncFromNative().then(() => this.checkAndRun());
          }
        });

        this.checkAndRun();
      })();
    }
    return this.initPromise;
  }

  async setSchedule(config: ScheduledTestConfig): Promise<void> {
    await this.init();
    const full = withTimestamps(config);
    this.setState({ ...EMPTY_STATE, config: full });
    await this.persist();

    const bridge = nativeBridge();
    if (bridge && typeof bridge.setSchedule === 'function') {
      try {
        const appConfig = await getConfig();
        const deviceId = await getDeviceId();
        await bridge.setSchedule(
          full.frequency,
          full.fromTs! / 1000,
          full.toTs! / 1000,
          appConfig.serverUrl,
          deviceId
        );
      } catch (e) {
        console.warn('NativeMonitorBridge.setSchedule error:', e);
      }
    }

    this.checkAndRun();
  }

  async clearSchedule(): Promise<void> {
    await this.init();
    this.setState({ ...EMPTY_STATE });
    await this.persist();
    const bridge = nativeBridge();
    if (bridge && typeof bridge.clearSchedule === 'function') {
      bridge.clearSchedule().catch(() => {});
    }
  }

  /** Runs the scheduled test if one is due in the current period. */
  async checkAndRun(): Promise<void> {
    const config = this.state.config;
    if (this.checking || !config || config.fromTs == null || config.toTs == null) return;

    const now = Date.now();
    if (now < config.fromTs || now > config.toTs) return;
    const period = schedulePeriodIndex(config.frequency, config.fromTs, now);
    if (this.state.lastRunPeriod === period) return;

    this.checking = true;
    this.setState({ isRunning: true });
    try {
      // Location first, outside the exclusive test slot
      const loc = await locationService.getCurrentLocation();

      const outcome = await testCoordinator.run('scheduled', async () => {
        // Collapse: re-checked after waiting for the slot, since the test we
        // were queued behind may itself have been a full speed test.
        const last = testCoordinator.getLastFullTest();
        if (last.owner && last.owner !== 'scheduled' && Date.now() - last.at < COLLAPSE_WINDOW_MS) {
          return `Covered by ${OWNER_LABELS[last.owner]} test`;
        }

        const appConfig = await getConfig();
        const deviceId = await getDeviceId();
        const result = await speedTester.runFullTest(appConfig);
        testCoordinator.markFullTestCompleted('scheduled');

        const sample: Sample = {
          id: generateUUID(),
          device_id: deviceId,
          ts: Math.floor(Date.now() / 1000),
          down_mbps: result.downMbps,
          up_mbps: result.upMbps,
          latency_ms: result.latency,
          jitter_ms: result.jitter,
          packet_loss_pct: result.packetLoss,
          network: result.networkType,
          radio: result.radioTech,
          carrier: result.carrier,
          device_model: Platform.OS === 'ios' ? 'Apple iPhone' : 'Android Device',
          os_platform: `${Platform.OS} ${Platform.Version}`,
          location_type: loc.accuracy && loc.accuracy < 25 ? 'Outdoor' : 'Indoor',
          lat: loc.lat,
          lng: loc.lng,
          accuracy: loc.accuracy,
          test_type: 'scheduled',
        };
        await sampleStore.add(sample);
        uploader.flush().catch(() => {});

        const down = result.downMbps != null ? `${result.downMbps.toFixed(1)} Mbps` : '--';
        const ping = result.latency != null ? `${result.latency} ms` : '--';
        return `${down} • ${ping}`;
      });

      // Schedule may have been cleared/replaced while the test ran
      if (this.state.config !== config) return;
      await this.markRun(period, outcome);
    } catch (err: any) {
      // Not marked as done: retried on the next check
      if (this.state.config === config) {
        this.setState({ lastOutcome: `Failed: ${err?.message || 'test error'} (will retry)` });
      }
    } finally {
      this.checking = false;
      this.setState({ isRunning: false });
    }
  }

  private async markRun(period: number, outcome: string) {
    const at = Date.now();
    this.setState({
      lastRunPeriod: period,
      lastRunAt: at,
      runCount: this.state.runCount + 1,
      lastOutcome: outcome,
    });
    await this.persist();
    const bridge = nativeBridge();
    if (bridge && typeof bridge.markScheduledRun === 'function') {
      bridge.markScheduledRun(period, at / 1000).catch(() => {});
    }
  }

  /** Picks up runs the native iOS background task performed while JS was not running. */
  private async syncFromNative() {
    const bridge = nativeBridge();
    if (!this.state.config || !bridge || typeof bridge.getScheduleState !== 'function') return;
    try {
      const native = await bridge.getScheduleState();
      const nativePeriod = typeof native?.lastRunPeriod === 'number' ? native.lastRunPeriod : -1;
      if (nativePeriod >= 0 && (this.state.lastRunPeriod == null || nativePeriod > this.state.lastRunPeriod)) {
        this.setState({
          lastRunPeriod: nativePeriod,
          lastRunAt: native.lastRunAt ? native.lastRunAt * 1000 : Date.now(),
          runCount: this.state.runCount + 1,
          lastOutcome: 'Ran in background',
        });
        await this.persist();
      }
    } catch (e) {
      console.warn('NativeMonitorBridge.getScheduleState error:', e);
    }
  }

  private async load() {
    try {
      const saved = await AsyncStorage.getItem(STORAGE_KEY_SCHEDULE);
      if (saved) {
        const parsed = JSON.parse(saved);
        this.setState({ ...EMPTY_STATE, ...parsed, isRunning: false });
      }
    } catch (e) {
      console.warn('Failed to load scheduled test', e);
    }
  }

  private async persist() {
    try {
      if (!this.state.config) {
        await AsyncStorage.removeItem(STORAGE_KEY_SCHEDULE);
        return;
      }
      const persisted: Partial<ScheduleState> = { ...this.state };
      delete persisted.isRunning;
      await AsyncStorage.setItem(STORAGE_KEY_SCHEDULE, JSON.stringify(persisted));
    } catch (e) {
      console.warn('Failed to save scheduled test', e);
    }
  }

  private setState(patch: Partial<ScheduleState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach(fn => {
      try {
        fn(this.state);
      } catch (e) {
        console.warn('Listener error in ScheduledTestService:', e);
      }
    });
  }
}

export const scheduledTestService = new ScheduledTestService();

/** React hook: live schedule state. */
export function useScheduleState(): ScheduleState {
  const [state, setState] = useState<ScheduleState>(scheduledTestService.getState());
  useEffect(() => scheduledTestService.subscribe(setState), []);
  return state;
}
