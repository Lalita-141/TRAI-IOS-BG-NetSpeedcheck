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

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface ScheduleState {
  config: ScheduledTestConfig | null;
  lastRunPeriod: number | null; // occurrenceId of the last handled run slot
  lastRunAt: number | null; // ms
  runCount: number;
  lastOutcome: string | null;
  isRunning: boolean;
}

export interface ScheduleTiming {
  frequency: ScheduleFrequency;
  hour: number; // 0-23
  minute: number; // 0-59
  weekday: number; // 0 = Sunday ... 6 = Saturday (weekly)
  monthDay: number; // 1-31, clamped to the month's last day (monthly)
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

export function resolveTiming(config: ScheduledTestConfig): ScheduleTiming {
  const from = new Date(config.fromTs ?? Date.now());
  return {
    frequency: config.frequency,
    hour: config.hour ?? 9,
    minute: config.minute ?? 0,
    weekday: config.weekday ?? from.getDay(),
    monthDay: config.monthDay ?? from.getDate(),
  };
}

const atTime = (year: number, month: number, day: number, t: ScheduleTiming) =>
  new Date(year, month, day, t.hour, t.minute, 0, 0).getTime();

const monthOccurrence = (year: number, month: number, t: ScheduleTiming) => {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return atTime(year, month, Math.min(t.monthDay, daysInMonth), t);
};

/**
 * Most recent scheduled run time at or before `now`.
 * Must stay in sync with NativeMonitorService.scheduleOccurrence(onOrBefore:) (iOS).
 */
export function latestOccurrence(t: ScheduleTiming, now: number): number {
  const d = new Date(now);
  const y = d.getFullYear();
  const m = d.getMonth();
  const day = d.getDate();
  if (t.frequency === 'monthly') {
    const c = monthOccurrence(y, m, t);
    return c <= now ? c : monthOccurrence(y, m - 1, t);
  }
  if (t.frequency === 'weekly') {
    const diff = (d.getDay() - t.weekday + 7) % 7;
    const c = atTime(y, m, day - diff, t);
    return c <= now ? c : atTime(y, m, day - diff - 7, t);
  }
  const c = atTime(y, m, day, t);
  return c <= now ? c : atTime(y, m, day - 1, t);
}

/** First scheduled run time strictly after `after`. */
export function nextOccurrence(t: ScheduleTiming, after: number): number {
  const d = new Date(after);
  const y = d.getFullYear();
  const m = d.getMonth();
  const day = d.getDate();
  if (t.frequency === 'monthly') {
    const c = monthOccurrence(y, m, t);
    return c > after ? c : monthOccurrence(y, m + 1, t);
  }
  if (t.frequency === 'weekly') {
    const diff = (t.weekday - d.getDay() + 7) % 7;
    const c = atTime(y, m, day + diff, t);
    return c > after ? c : atTime(y, m, day + diff + 7, t);
  }
  const c = atTime(y, m, day, t);
  return c > after ? c : atTime(y, m, day + 1, t);
}

/** Stable id of a run slot (minutes since epoch). Same formula on the native side. */
export const occurrenceId = (ts: number) => Math.floor(ts / 60000);

/** The run slot that should be handled now, or null if nothing is due. */
export function dueOccurrence(state: ScheduleState, now: number = Date.now()): number | null {
  const config = state.config;
  if (!config || config.fromTs == null || config.toTs == null) return null;
  if (now < config.fromTs || now > config.toTs) return null;
  const latest = latestOccurrence(resolveTiming(config), now);
  if (latest < config.fromTs) return null;
  return state.lastRunPeriod === occurrenceId(latest) ? null : latest;
}

/** When the next scheduled run happens (`now` if one is due), or null if the schedule is over. */
export function getNextRunAt(state: ScheduleState, now: number = Date.now()): number | null {
  const config = state.config;
  if (!config || config.fromTs == null || config.toTs == null) return null;
  if (now > config.toTs) return null;
  if (dueOccurrence(state, now) != null) return now;
  const next = nextOccurrence(resolveTiming(config), Math.max(now, config.fromTs - 1));
  return next <= config.toTs ? next : null;
}

export function formatClock(hour: number, minute: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${minute.toString().padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
}

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

/** e.g. "Daily at 9:30 AM", "Every Monday at 9:30 AM", "Monthly on the 15th at 9:30 AM" */
export function describeSchedule(config: ScheduledTestConfig): string {
  const t = resolveTiming(config);
  const time = formatClock(t.hour, t.minute);
  if (t.frequency === 'weekly') return `Every ${WEEKDAY_NAMES[t.weekday]} at ${time}`;
  if (t.frequency === 'monthly') return `Monthly on the ${ordinal(t.monthDay)} at ${time}`;
  return `Daily at ${time}`;
}

function withTimestamps(config: ScheduledTestConfig): ScheduledTestConfig {
  const fromTs = config.fromTs ?? startOfDay(Date.now());
  const toTs = config.toTs ?? startOfDay(Date.now()) + 8 * DAY_MS - 1;
  return { ...config, ...resolveTiming({ ...config, fromTs }), fromTs, toTs };
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

        setInterval(() => {
          this.checkAndRun();
        }, CHECK_INTERVAL_MS);

        AppState.addEventListener('change', nextState => {
          if (nextState === 'active') {
            this.checkAndRun();
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
    const now = Date.now();

    // A run time that already passed today (or this week / month) before the
    // schedule was created is skipped: the first run is the next upcoming slot.
    const latest = latestOccurrence(resolveTiming(full), now);
    const skipped = now >= full.fromTs! && latest >= full.fromTs! ? occurrenceId(latest) : null;

    this.setState({ ...EMPTY_STATE, config: full, lastRunPeriod: skipped });
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
          full.hour,
          full.minute,
          full.weekday,
          full.monthDay,
          appConfig.serverUrl,
          deviceId
        );
        if (skipped != null) {
          await bridge.markScheduledRun(skipped, now / 1000);
        }
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

  /** Runs the scheduled test if its run time has arrived and it hasn't run yet. */
  async checkAndRun(): Promise<void> {
    const config = this.state.config;
    if (this.checking || !config) return;
    if (dueOccurrence(this.state) == null) return;

    this.checking = true;
    try {
      // The native iOS side may have already handled this slot (or be testing it right now)
      const nativeBusy = await this.syncFromNative();
      if (nativeBusy) return; // retried on the next check
      const occurrence = dueOccurrence(this.state);
      if (occurrence == null || this.state.config !== config) return;
      const period = occurrenceId(occurrence);

      this.setState({ isRunning: true });

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

  /**
   * Picks up runs the native iOS side performed while JS was not running.
   * Returns true while a native test is in progress.
   */
  private async syncFromNative(): Promise<boolean> {
    const bridge = nativeBridge();
    if (!this.state.config || !bridge || typeof bridge.getScheduleState !== 'function') return false;
    try {
      const native = await bridge.getScheduleState();
      const nativePeriod = typeof native?.lastRunPeriod === 'number' ? native.lastRunPeriod : -1;
      if (nativePeriod >= 0 && (this.state.lastRunPeriod == null || nativePeriod > this.state.lastRunPeriod)) {
        const ranByNative = native.lastRunAt && native.lastRunAt * 1000 > (this.state.lastRunAt ?? 0);
        this.setState({
          lastRunPeriod: nativePeriod,
          lastRunAt: native.lastRunAt ? native.lastRunAt * 1000 : Date.now(),
          runCount: this.state.runCount + (ranByNative ? 1 : 0),
          lastOutcome: ranByNative ? 'Ran in background' : this.state.lastOutcome,
        });
        await this.persist();
      }
      return native?.isTesting === true;
    } catch (e) {
      console.warn('NativeMonitorBridge.getScheduleState error:', e);
      return false;
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
