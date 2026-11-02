jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}));
jest.mock('@react-native-community/netinfo', () => ({ fetch: jest.fn(), NetInfoStateType: {} }));
jest.mock('@react-native-community/geolocation', () => ({
  setRNConfiguration: jest.fn(),
  watchPosition: jest.fn(() => 1),
  clearWatch: jest.fn(),
  requestAuthorization: jest.fn(),
  getCurrentPosition: jest.fn(),
}));
jest.mock(
  'react-native-background-actions',
  () => {
    let running = false;
    return {
      __esModule: true,
      default: {
        isRunning: () => running,
        start: jest.fn(async () => {
          running = true;
        }),
        stop: jest.fn(async () => {
          running = false;
        }),
      },
    };
  },
  { virtual: true }
);

import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import BackgroundService from 'react-native-background-actions';
import { backgroundKeepAlive } from '../src/services/backgroundKeepAlive';
import { continuousTestService } from '../src/services/continuousTestService';
import { speedTester } from '../src/services/speedTester';
import { scheduledTestService } from '../src/services/scheduledTestService';

const flush = () => new Promise<void>(resolve => setImmediate(resolve));
const bridge = {
  acquireKeepAlive: jest.fn(async () => true),
  releaseKeepAlive: jest.fn(async () => true),
};

beforeEach(() => {
  jest.clearAllMocks();
  NativeModules.NativeMonitorBridge = bridge;
});

afterEach(() => {
  Platform.OS = 'ios';
  delete NativeModules.RNBackgroundActions;
  delete NativeModules.NativeMonitorBridge;
});

describe('backgroundKeepAlive on iOS', () => {
  it('forwards the tag and relaunch flag to native once per holder', () => {
    backgroundKeepAlive.acquire('a', { relaunchAfterKill: true });
    backgroundKeepAlive.acquire('a', { relaunchAfterKill: true });
    expect(bridge.acquireKeepAlive).toHaveBeenCalledTimes(1);
    expect(bridge.acquireKeepAlive).toHaveBeenCalledWith('a', true);

    backgroundKeepAlive.release('a');
    expect(bridge.releaseKeepAlive).toHaveBeenCalledWith('a');
    expect(backgroundKeepAlive.isHeld('a')).toBe(false);
  });

  it('still tells native to release a holder from before the app was killed', () => {
    backgroundKeepAlive.release('from-previous-launch');
    expect(bridge.releaseKeepAlive).toHaveBeenCalledWith('from-previous-launch');
  });
});

describe('backgroundKeepAlive on Android', () => {
  let check: jest.SpyInstance;

  beforeEach(() => {
    Platform.OS = 'android';
    NativeModules.RNBackgroundActions = {};
    check = jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
    jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue('granted');
  });

  it('shares one service until the last holder releases', async () => {
    backgroundKeepAlive.acquire('a');
    backgroundKeepAlive.acquire('b');
    await flush();
    expect(BackgroundService.start).toHaveBeenCalledTimes(1);

    backgroundKeepAlive.release('a');
    await flush();
    expect(BackgroundService.stop).not.toHaveBeenCalled();

    backgroundKeepAlive.release('b');
    await flush();
    expect(BackgroundService.stop).toHaveBeenCalledTimes(1);
  });

  it('declares a service type, using dataSync without location permission', async () => {
    check.mockResolvedValue(false);
    backgroundKeepAlive.acquire('a');
    await flush();
    expect((BackgroundService.start as jest.Mock).mock.calls[0][1].foregroundServiceType).toEqual(['dataSync']);
    backgroundKeepAlive.release('a');
    await flush();

    check.mockResolvedValue(true);
    backgroundKeepAlive.acquire('a');
    await flush();
    expect((BackgroundService.start as jest.Mock).mock.calls[1][1].foregroundServiceType).toEqual(['location']);
    backgroundKeepAlive.release('a');
    await flush();
  });
});

describe('continuous session restore', () => {
  const config = { testType: 'speed', gapSeconds: 5, durationMins: 10 };
  const savedSession = (endsAt: number) =>
    JSON.stringify({ config, startedAt: endsAt - 600000, endsAt, currentCycle: 3, cycles: [] });

  it('finishes a session whose time ran out while the app was dead', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(savedSession(Date.now() - 1000));
    await continuousTestService.restore();

    const state = continuousTestService.getState();
    expect(state.active).toBe(false);
    expect(state.lastResults?.totalCyclesCompleted).toBe(0);
    expect(state.resultsSeen).toBe(false);
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('@speedmonitor_continuous_session');
    expect(bridge.releaseKeepAlive).toHaveBeenCalledWith('continuous');
  });

  it('resumes a session that still has time left, keeping its cycle count', async () => {
    jest.spyOn(speedTester, 'runFullTest').mockRejectedValue(new Error('offline'));
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(savedSession(Date.now() + 60000));
    await continuousTestService.restore();

    expect(continuousTestService.getState().active).toBe(true);
    expect(bridge.acquireKeepAlive).toHaveBeenCalledWith('continuous', true);
    await flush();
    expect(continuousTestService.getState().currentCycle).toBe(4);

    await continuousTestService.stop();
    expect(continuousTestService.getState().active).toBe(false);
    expect(bridge.releaseKeepAlive).toHaveBeenCalledWith('continuous');
  });

  it('does nothing when no session was saved', async () => {
    await continuousTestService.restore();
    expect(bridge.acquireKeepAlive).not.toHaveBeenCalled();
  });
});

describe('scheduled keep-alive', () => {
  const day = 24 * 60 * 60 * 1000;
  const base = { frequency: 'daily' as const, fromDate: '', toDate: '', hour: 0, minute: 0 };

  it('holds while runs remain and releases when the schedule is cleared or over', async () => {
    await scheduledTestService.setSchedule({
      ...base,
      fromTs: Date.now() + day,
      toTs: Date.now() + 3 * day,
    });
    expect(backgroundKeepAlive.isHeld('scheduled')).toBe(true);
    expect(bridge.acquireKeepAlive).toHaveBeenCalledWith('scheduled', true);

    await scheduledTestService.clearSchedule();
    expect(backgroundKeepAlive.isHeld('scheduled')).toBe(false);

    await scheduledTestService.setSchedule({
      ...base,
      fromTs: Date.now() - 3 * day,
      toTs: Date.now() - day,
    });
    expect(backgroundKeepAlive.isHeld('scheduled')).toBe(false);
    await scheduledTestService.clearSchedule();
  });
});
