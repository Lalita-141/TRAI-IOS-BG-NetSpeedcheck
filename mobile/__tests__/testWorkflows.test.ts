/**
 * End-to-end app workflows with the network measured by mocks:
 * "Test Now" (monitorService), scheduled tests (scheduledTestService) and the
 * one-test-at-a-time rule (testCoordinator).
 */
const mockStorage: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockStorage[k] ?? null),
  setItem: jest.fn(async (k: string, v: string) => {
    mockStorage[k] = v;
  }),
  removeItem: jest.fn(async (k: string) => {
    delete mockStorage[k];
  }),
}));
jest.mock('@react-native-community/netinfo', () => ({ fetch: jest.fn(), NetInfoStateType: {} }));
jest.mock('@react-native-community/geolocation', () => ({}));
jest.mock('../src/config', () => ({
  getConfig: jest.fn(async () => ({
    serverUrl: 'https://speed.example.com',
    testIntervalSeconds: 10,
    wifiOnly: false,
    batchSize: 20,
    testLabel: 'Outdoor',
  })),
  getDeviceId: jest.fn(async () => 'device-1'),
}));
jest.mock('../src/services/speedTester', () => ({ speedTester: { runFullTest: jest.fn() } }));
jest.mock('../src/services/sampleStore', () => ({
  sampleStore: { add: jest.fn(async () => {}), getPendingCount: jest.fn(async () => 0) },
}));
jest.mock('../src/services/uploader', () => ({ uploader: { flush: jest.fn(async () => ({ success: true })) } }));
jest.mock('../src/services/locationService', () => ({
  locationService: {
    getCurrentLocation: jest.fn(async () => ({ lat: 28.6, lng: 77.2, accuracy: 8 })),
    requestPermission: jest.fn(async () => true),
    watchPosition: jest.fn(() => 1),
    clearWatch: jest.fn(),
  },
}));
jest.mock('../src/services/backgroundKeepAlive', () => ({
  backgroundKeepAlive: { acquire: jest.fn(), release: jest.fn() },
}));
jest.mock('../src/services/locationPermission', () => ({
  promptForBackgroundLocation: jest.fn(async () => {}),
}));

import { NativeModules, Platform } from 'react-native';

const RESULT = {
  latency: 24,
  jitter: 3.5,
  packetLoss: 0,
  downMbps: 87.456,
  upMbps: 21.3,
  networkType: 'cellular',
  radioTech: '5G',
  carrier: 'Jio',
  signal: { signal_dbm: -90, signal_quality: 'Better', cell_tower: null, frequency_band: null },
};

const tick = () => new Promise<void>(resolve => setTimeout(() => resolve(), 0));

/** A fresh copy of every service (and its mocks) per test. */
function loadApp() {
  let app: any;
  jest.isolateModules(() => {
    app = {
      coordinator: require('../src/services/testCoordinator').testCoordinator,
      monitor: require('../src/services/monitorService').monitorService,
      scheduled: require('../src/services/scheduledTestService').scheduledTestService,
      speedTester: require('../src/services/speedTester').speedTester,
      sampleStore: require('../src/services/sampleStore').sampleStore,
      uploader: require('../src/services/uploader').uploader,
      keepAlive: require('../src/services/backgroundKeepAlive').backgroundKeepAlive,
    };
  });
  app.speedTester.runFullTest.mockResolvedValue(RESULT);
  return app;
}

beforeEach(() => {
  Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
  delete NativeModules.NativeMonitorBridge;
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('testCoordinator', () => {
  it('tells listeners who is testing and how many are waiting', async () => {
    const { coordinator } = loadApp();
    const seen: string[] = [];
    const unsubscribe = coordinator.subscribe((s: any) => seen.push(`${s.activeOwner}/${s.queuedCount}`));
    await Promise.all([coordinator.run('manual', async () => {}), coordinator.run('scheduled', async () => {})]);
    unsubscribe();
    await coordinator.run('monitor', async () => {});
    expect(seen).toEqual([
      'null/1',
      'null/2',
      'manual/1',
      'null/1',
      'scheduled/0',
      'null/0',
    ]);
  });

  it('keeps going when a listener throws', async () => {
    const { coordinator } = loadApp();
    coordinator.subscribe(() => {
      throw new Error('bad listener');
    });
    await expect(coordinator.run('manual', async () => 7)).resolves.toBe(7);
  });

  it('on iOS tells the native background tester to wait while a JS test runs', async () => {
    const original = Platform.OS;
    (Platform as any).OS = 'ios';
    const setJsTestLease = jest.fn(async () => {});
    NativeModules.NativeMonitorBridge = { setJsTestLease };
    try {
      const { coordinator } = loadApp();
      await coordinator.run('manual', async () => {
        expect(setJsTestLease).toHaveBeenLastCalledWith(120);
      });
      expect(setJsTestLease).toHaveBeenLastCalledWith(0);
    } finally {
      (Platform as any).OS = original;
    }
  });
});

describe('Test Now (monitorService.testNow)', () => {
  it('runs a full test and saves a complete speed sample', async () => {
    const { monitor, sampleStore, uploader } = loadApp();
    const sample = await monitor.testNow();
    expect(sample).toMatchObject({
      device_id: 'device-1',
      down_mbps: 87.456,
      up_mbps: 21.3,
      latency_ms: 24,
      jitter_ms: 3.5,
      packet_loss_pct: 0,
      network: 'cellular',
      radio: '5G',
      carrier: 'Jio',
      signal_dbm: -90,
      signal_quality: 'Better',
      location_type: 'Outdoor',
      lat: 28.6,
      lng: 77.2,
      accuracy: 8,
      test_type: 'speed',
    });
    expect(sample.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(Math.abs(sample.ts - Date.now() / 1000)).toBeLessThan(5);
    expect(sampleStore.add).toHaveBeenCalledWith(sample);
    expect(uploader.flush).toHaveBeenCalled();
    expect(monitor.getLastSample()).toBe(sample);
  });

  it('reports progress and the final result to listeners', async () => {
    const { monitor, speedTester } = loadApp();
    speedTester.runFullTest.mockImplementation(async (_c: any, onProgress: any) => {
      onProgress({ phase: 'download', message: 'Measuring download speed...', progressPercent: 45, downSpeed: 50 });
      return RESULT;
    });
    const statuses: any[] = [];
    monitor.subscribe((s: any) => statuses.push(s));
    await monitor.testNow();
    await tick();
    const phases = statuses.map(s => s.currentProgress?.phase).filter(Boolean);
    expect(phases).toEqual(['idle', 'download', 'complete']);
    const last = statuses[statuses.length - 1];
    expect(last).toMatchObject({ isTesting: false, error: null });
    expect(last.currentProgress).toMatchObject({ downSpeed: 87.456, upSpeed: 21.3, latency: 24 });
  });

  it('keeps the app awake for the test and lets go afterwards', async () => {
    const { monitor, keepAlive } = loadApp();
    await monitor.testNow();
    expect(keepAlive.acquire).toHaveBeenCalledWith('speed-test');
    expect(keepAlive.release).toHaveBeenCalledWith('speed-test');
  });

  it('saves nothing and reports the error when the test fails', async () => {
    const { monitor, speedTester, sampleStore, keepAlive } = loadApp();
    speedTester.runFullTest.mockRejectedValue(new Error('No internet connection'));
    const statuses: any[] = [];
    monitor.subscribe((s: any) => statuses.push(s));
    expect(await monitor.testNow()).toBeNull();
    await tick();
    expect(sampleStore.add).not.toHaveBeenCalled();
    expect(statuses[statuses.length - 1]).toMatchObject({ isTesting: false, error: 'No internet connection' });
    expect(keepAlive.release).toHaveBeenCalledWith('speed-test');
  });

  it('ignores a second tap while a test is running', async () => {
    const { monitor, speedTester } = loadApp();
    let finish!: (r: any) => void;
    speedTester.runFullTest.mockReturnValue(new Promise(r => (finish = r)));
    const first = monitor.testNow();
    expect(await monitor.testNow()).toBeNull();
    await tick();
    finish(RESULT);
    expect(await first).not.toBeNull();
    expect(speedTester.runFullTest).toHaveBeenCalledTimes(1);
  });

  it('waits for another feature\'s test instead of running at the same time', async () => {
    const { monitor, coordinator, speedTester } = loadApp();
    let release!: () => void;
    const other = coordinator.run('continuous', () => new Promise<void>(r => (release = r)));
    const manual = monitor.testNow();
    await tick();
    expect(speedTester.runFullTest).not.toHaveBeenCalled();
    release();
    await other;
    await manual;
    expect(speedTester.runFullTest).toHaveBeenCalledTimes(1);
  });
});

describe('scheduled tests', () => {
  // Monday 2 Nov 2026, 08:00 local time
  const MONDAY_8AM = new Date(2026, 10, 2, 8, 0).getTime();
  const schedule = {
    frequency: 'daily' as const,
    fromDate: '2026-11-02',
    toDate: '2026-11-04',
    fromTs: new Date(2026, 10, 2).getTime(),
    toTs: new Date(2026, 10, 4, 23, 59, 59).getTime(),
    hour: 9,
    minute: 0,
  };

  const flush = async (ms = 0) => {
    await jest.advanceTimersByTimeAsync(ms);
  };

  beforeEach(() => {
    jest.useFakeTimers({ now: MONDAY_8AM });
  });

  it('does not run before the scheduled time', async () => {
    const { scheduled, speedTester } = loadApp();
    await scheduled.setSchedule(schedule);
    await flush(30 * 60 * 1000); // 08:30
    expect(speedTester.runFullTest).not.toHaveBeenCalled();
    expect(scheduled.getState().runCount).toBe(0);
  });

  it('runs once at the scheduled time and saves a scheduled sample', async () => {
    const { scheduled, speedTester, sampleStore } = loadApp();
    await scheduled.setSchedule(schedule);
    await flush(62 * 60 * 1000); // 09:02, several due-checks later
    expect(speedTester.runFullTest).toHaveBeenCalledTimes(1);
    expect(sampleStore.add).toHaveBeenCalledWith(
      expect.objectContaining({ test_type: 'scheduled', down_mbps: 87.456, lat: 28.6 })
    );
    const state = scheduled.getState();
    expect(state.runCount).toBe(1);
    expect(state.lastOutcome).toBe('87.5 Mbps • 24 ms');
  });

  it('runs again the next day', async () => {
    const { scheduled, speedTester } = loadApp();
    await scheduled.setSchedule(schedule);
    await flush(25 * 60 * 60 * 1000 + 2 * 60 * 1000); // Tuesday 09:02
    expect(speedTester.runFullTest).toHaveBeenCalledTimes(2);
  });

  it('skips a run time that had already passed when the schedule was created', async () => {
    jest.setSystemTime(new Date(2026, 10, 2, 10, 0).getTime()); // 10:00, after 09:00
    const { scheduled, speedTester } = loadApp();
    await scheduled.setSchedule(schedule);
    await flush(5 * 60 * 1000);
    expect(speedTester.runFullTest).not.toHaveBeenCalled();
  });

  it('uses a speed test that just finished instead of running a duplicate', async () => {
    const { scheduled, speedTester, coordinator, sampleStore } = loadApp();
    await scheduled.setSchedule(schedule);
    await flush(59 * 60 * 1000); // 08:59
    coordinator.markFullTestCompleted('manual');
    await flush(2 * 60 * 1000); // 09:01
    expect(speedTester.runFullTest).not.toHaveBeenCalled();
    expect(sampleStore.add).not.toHaveBeenCalled();
    expect(scheduled.getState().lastOutcome).toBe('Covered by manual speed test');
    expect(scheduled.getState().runCount).toBe(1);
  });

  it('retries a failed run on the next check', async () => {
    const { scheduled, speedTester } = loadApp();
    speedTester.runFullTest.mockRejectedValueOnce(new Error('No internet connection'));
    await scheduled.setSchedule(schedule);
    await flush(60 * 60 * 1000 + 30 * 1000); // 09:00:30, first check fails
    expect(scheduled.getState().lastOutcome).toBe('Failed: No internet connection (will retry)');
    expect(scheduled.getState().runCount).toBe(0);
    await flush(60 * 1000);
    expect(scheduled.getState().runCount).toBe(1);
    expect(speedTester.runFullTest).toHaveBeenCalledTimes(2);
  });

  it('stops after the last day', async () => {
    const { scheduled, speedTester } = loadApp();
    await scheduled.setSchedule(schedule);
    await flush(5 * 24 * 60 * 60 * 1000); // through Saturday
    expect(speedTester.runFullTest).toHaveBeenCalledTimes(3); // Mon, Tue, Wed
  });

  it('remembers the schedule across restarts, and clearing removes it', async () => {
    const first = loadApp();
    await first.scheduled.setSchedule(schedule);
    expect(JSON.parse(mockStorage['@speedmonitor_scheduled_test']).config.hour).toBe(9);

    const restarted = loadApp();
    await restarted.scheduled.init();
    expect(restarted.scheduled.getState().config).toMatchObject({ frequency: 'daily', hour: 9 });

    await restarted.scheduled.clearSchedule();
    expect(restarted.scheduled.getState().config).toBeNull();
    expect(mockStorage['@speedmonitor_scheduled_test']).toBeUndefined();
  });
});
