jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}));
jest.mock('@react-native-community/netinfo', () => ({ fetch: jest.fn(), NetInfoStateType: {} }));
jest.mock('@react-native-community/geolocation', () => ({}));

import { testCoordinator } from '../src/services/testCoordinator';
import {
  latestOccurrence,
  nextOccurrence,
  occurrenceId,
  dueOccurrence,
  describeSchedule,
  ScheduleTiming,
  getNextRunAt,
  ScheduleState,
} from '../src/services/scheduledTestService';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(r => (resolve = r));
  return { promise, resolve };
};

describe('testCoordinator', () => {
  it('runs tests one at a time in request order', async () => {
    const order: string[] = [];
    const gate = deferred();

    const first = testCoordinator.run('monitor', async () => {
      order.push('monitor:start');
      await gate.promise;
      order.push('monitor:end');
    });
    const second = testCoordinator.run('continuous', async () => {
      order.push('continuous:start');
    });

    await Promise.resolve();
    expect(testCoordinator.isBusy()).toBe(true);
    expect(testCoordinator.getActiveOwner()).toBe('monitor');

    gate.resolve();
    await Promise.all([first, second]);
    expect(order).toEqual(['monitor:start', 'monitor:end', 'continuous:start']);
    expect(testCoordinator.isBusy()).toBe(false);
  });

  it('keeps the queue moving after a failed test', async () => {
    await expect(
      testCoordinator.run('scheduled', async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
    await expect(testCoordinator.run('manual', async () => 'ok')).resolves.toBe('ok');
  });

  it('records the last full speed test for collapsing', () => {
    testCoordinator.markFullTestCompleted('continuous');
    const last = testCoordinator.getLastFullTest();
    expect(last.owner).toBe('continuous');
    expect(Date.now() - last.at).toBeLessThan(1000);
  });
});

const ts = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo, d, h, mi).getTime();
const timing = (patch: Partial<ScheduleTiming>): ScheduleTiming => ({
  frequency: 'daily',
  hour: 9,
  minute: 30,
  weekday: 1,
  monthDay: 15,
  ...patch,
});

describe('schedule run times', () => {
  // Oct 29 2026 is a Thursday
  it('daily: today at the time, else yesterday / tomorrow', () => {
    const t = timing({});
    expect(latestOccurrence(t, ts(2026, 9, 29, 10))).toBe(ts(2026, 9, 29, 9, 30));
    expect(latestOccurrence(t, ts(2026, 9, 29, 9, 0))).toBe(ts(2026, 9, 28, 9, 30));
    expect(nextOccurrence(t, ts(2026, 9, 29, 9, 0))).toBe(ts(2026, 9, 29, 9, 30));
    expect(nextOccurrence(t, ts(2026, 9, 29, 9, 30))).toBe(ts(2026, 9, 30, 9, 30));
  });

  it('weekly: selected weekday at the time', () => {
    const t = timing({ frequency: 'weekly', weekday: 1 }); // Monday
    expect(latestOccurrence(t, ts(2026, 9, 29, 12))).toBe(ts(2026, 9, 26, 9, 30));
    expect(nextOccurrence(t, ts(2026, 9, 29, 12))).toBe(ts(2026, 10, 2, 9, 30));
    expect(nextOccurrence(t, ts(2026, 10, 2, 9, 30))).toBe(ts(2026, 10, 9, 9, 30));
  });

  it('monthly: selected day, clamped to short months', () => {
    const t = timing({ frequency: 'monthly', monthDay: 31, hour: 18, minute: 0 });
    expect(nextOccurrence(t, ts(2026, 9, 29))).toBe(ts(2026, 9, 31, 18));
    expect(nextOccurrence(t, ts(2026, 9, 31, 18))).toBe(ts(2026, 10, 30, 18)); // November has 30 days
    expect(latestOccurrence(t, ts(2027, 1, 10))).toBe(ts(2027, 0, 31, 18));
    expect(nextOccurrence(t, ts(2027, 1, 10))).toBe(ts(2027, 1, 28, 18)); // February
  });

  it('describes the schedule', () => {
    const base = { fromDate: '', toDate: '', hour: 21, minute: 5 };
    expect(describeSchedule({ ...base, frequency: 'daily' })).toBe('Daily at 9:05 PM');
    expect(describeSchedule({ ...base, frequency: 'weekly', weekday: 0 })).toBe('Every Sunday at 9:05 PM');
    expect(describeSchedule({ ...base, frequency: 'monthly', monthDay: 2 })).toBe('Monthly on the 2nd at 9:05 PM');
  });
});

describe('due / next run', () => {
  const fromTs = ts(2026, 9, 29);
  const toTs = new Date(2026, 10, 4, 23, 59, 59, 999).getTime();
  const base: ScheduleState = {
    config: {
      frequency: 'daily',
      fromDate: 'Oct 29',
      toDate: 'Nov 4',
      fromTs,
      toTs,
      hour: 9,
      minute: 30,
    },
    lastRunPeriod: null,
    lastRunAt: null,
    runCount: 0,
    lastOutcome: null,
    isRunning: false,
  };

  it('not due before the run time', () => {
    const now = ts(2026, 9, 29, 9, 0);
    expect(dueOccurrence(base, now)).toBeNull();
    expect(getNextRunAt(base, now)).toBe(ts(2026, 9, 29, 9, 30));
  });

  it('due once the run time passes, until it is marked', () => {
    const now = ts(2026, 9, 29, 9, 31);
    expect(dueOccurrence(base, now)).toBe(ts(2026, 9, 29, 9, 30));
    const ran = { ...base, lastRunPeriod: occurrenceId(ts(2026, 9, 29, 9, 30)) };
    expect(dueOccurrence(ran, now)).toBeNull();
    expect(getNextRunAt(ran, now)).toBe(ts(2026, 9, 30, 9, 30));
  });

  it('ends after the last day', () => {
    const now = ts(2026, 10, 4, 10);
    const ran = { ...base, lastRunPeriod: occurrenceId(ts(2026, 10, 4, 9, 30)) };
    expect(getNextRunAt(ran, now)).toBeNull();
  });
});

