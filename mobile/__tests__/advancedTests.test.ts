jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}));
jest.mock('@react-native-community/netinfo', () => ({ fetch: jest.fn(), NetInfoStateType: {} }));
jest.mock('@react-native-community/geolocation', () => ({}));

import { testCoordinator } from '../src/services/testCoordinator';
import {
  schedulePeriodIndex,
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

describe('schedulePeriodIndex', () => {
  const from = new Date(2026, 9, 29, 0, 0, 0).getTime(); // Oct 29 2026

  it('daily: one period per calendar day', () => {
    expect(schedulePeriodIndex('daily', from, new Date(2026, 9, 29, 23, 59).getTime())).toBe(0);
    expect(schedulePeriodIndex('daily', from, new Date(2026, 9, 30, 0, 1).getTime())).toBe(1);
    expect(schedulePeriodIndex('daily', from, new Date(2026, 10, 2, 12).getTime())).toBe(4);
  });

  it('weekly: 7-day blocks from the start date', () => {
    expect(schedulePeriodIndex('weekly', from, new Date(2026, 10, 4, 12).getTime())).toBe(0);
    expect(schedulePeriodIndex('weekly', from, new Date(2026, 10, 5, 0, 1).getTime())).toBe(1);
  });

  it('monthly: calendar months', () => {
    expect(schedulePeriodIndex('monthly', from, new Date(2026, 9, 31).getTime())).toBe(0);
    expect(schedulePeriodIndex('monthly', from, new Date(2026, 10, 1).getTime())).toBe(1);
    expect(schedulePeriodIndex('monthly', from, new Date(2027, 0, 15).getTime())).toBe(3);
  });
});

describe('getNextRunAt', () => {
  const fromTs = new Date(2026, 9, 29, 0, 0, 0).getTime();
  const toTs = new Date(2026, 10, 4, 23, 59, 59, 999).getTime();
  const base: ScheduleState = {
    config: { frequency: 'daily', fromDate: 'Oct 29', toDate: 'Nov 4', fromTs, toTs },
    lastRunPeriod: null,
    lastRunAt: null,
    runCount: 0,
    lastOutcome: null,
    isRunning: false,
  };

  it('is due immediately when the current period has not run', () => {
    const now = new Date(2026, 9, 29, 10).getTime();
    expect(getNextRunAt(base, now)).toBe(now);
  });

  it('moves to the next day once today has run', () => {
    const now = new Date(2026, 9, 29, 10).getTime();
    expect(getNextRunAt({ ...base, lastRunPeriod: 0 }, now)).toBe(new Date(2026, 9, 30).getTime());
  });

  it('ends after the last day', () => {
    const now = new Date(2026, 10, 4, 10).getTime();
    expect(getNextRunAt({ ...base, lastRunPeriod: 6 }, now)).toBeNull();
  });
});
