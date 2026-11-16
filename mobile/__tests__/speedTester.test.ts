/**
 * Latency / jitter / packet loss, operator detection and the full speed test sequence
 * (src/services/speedTester.ts).
 */
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: jest.fn() },
  NetInfoStateType: { wifi: 'wifi', cellular: 'cellular', ethernet: 'ethernet' },
}));
jest.mock('../src/services/throughput', () => ({
  measureThroughput: jest.fn(),
}));

import NetInfo from '@react-native-community/netinfo';
import { NativeModules } from 'react-native';
import { speedTester, resolvePublicISP, rateSignal } from '../src/services/speedTester';
import { measureThroughput } from '../src/services/throughput';
import { AppConfig, SpeedTestProgress } from '../src/types';

const netInfoFetch = NetInfo.fetch as unknown as jest.Mock;
const throughput = measureThroughput as unknown as jest.Mock;

const config: AppConfig = {
  serverUrl: 'https://speed.example.com/',
  testIntervalSeconds: 10,
  downloadMB: 2,
  uploadMB: 1,
  wifiOnly: false,
  batchSize: 20,
};

const ispReply = (isp: string) => ({ ok: true, json: async () => ({ success: true, connection: { isp } }) });

/**
 * fetch stand-in: /ping takes the next duration from `pings` (null = failed), ipwho.is answers with `isp`.
 */
function fakeNetwork(pings: (number | null)[], isp = 'Reliance Jio Infocomm Limited') {
  const queue = [...pings];
  const urls: string[] = [];
  (globalThis as any).fetch = jest.fn((url: string) => {
    urls.push(url);
    if (url.includes('ipwho.is')) return Promise.resolve(ispReply(isp));
    const ms = queue.shift();
    return new Promise((resolve, reject) =>
      setTimeout(() => (ms == null ? reject(new Error('timeout')) : resolve({ ok: true })), ms ?? 1)
    );
  });
  return urls;
}

async function settle<T>(promise: Promise<T>): Promise<T> {
  await jest.advanceTimersByTimeAsync(60000);
  return promise;
}

beforeEach(() => {
  jest.useFakeTimers({ now: 1_000_000 });
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  delete NativeModules.TelephonyModule;
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('measureLatencyAndJitter', () => {
  it('sends one warm-up ping and 10 counted pings to /ping', async () => {
    const urls = fakeNetwork([500, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20]);
    await settle(speedTester.measureLatencyAndJitter('https://speed.example.com/'));
    expect(urls).toHaveLength(11);
    expect(urls[0]).toMatch(/^https:\/\/speed\.example\.com\/ping\?_t=\d+_warmup$/);
    expect(urls[10]).toMatch(/_9$/);
  });

  it('does not count the slow warm-up ping', async () => {
    fakeNetwork([900, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20]);
    const r = await settle(speedTester.measureLatencyAndJitter('https://speed.example.com'));
    expect(r).toEqual({ latency: 20, jitter: 0, packetLoss: 0 });
  });

  it('reports the median latency, so one spike does not move it', async () => {
    fakeNetwork([100, 30, 31, 29, 30, 400, 30, 31, 29, 30, 30]);
    const r = await settle(speedTester.measureLatencyAndJitter('https://speed.example.com'));
    expect(r.latency).toBe(30);
  });

  it('uses the middle two values for an even count', async () => {
    fakeNetwork([10, 10, 20, 30, 40, null, null, null, null, null, null]);
    const r = await settle(speedTester.measureLatencyAndJitter('https://speed.example.com'));
    expect(r.latency).toBe(25);
  });

  it('jitter is the average change between consecutive pings', async () => {
    // Changes: 10, 10, 10, 10, 10, 10, 10, 10, 10 → 10 ms
    fakeNetwork([5, 20, 30, 20, 30, 20, 30, 20, 30, 20, 30]);
    const r = await settle(speedTester.measureLatencyAndJitter('https://speed.example.com'));
    expect(r.jitter).toBe(10);
  });

  it('packet loss is the share of the 10 pings that failed', async () => {
    fakeNetwork([5, 20, null, 20, null, 20, null, 20, 20, 20, 20]);
    const r = await settle(speedTester.measureLatencyAndJitter('https://speed.example.com'));
    expect(r.packetLoss).toBe(30);
    expect(r.latency).toBe(20);
  });

  it('a failed warm-up ping is not counted as loss', async () => {
    fakeNetwork([null, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20]);
    const r = await settle(speedTester.measureLatencyAndJitter('https://speed.example.com'));
    expect(r.packetLoss).toBe(0);
  });

  it('gives 100% loss and no latency when every ping fails', async () => {
    fakeNetwork(Array(11).fill(null));
    const r = await settle(speedTester.measureLatencyAndJitter('https://speed.example.com'));
    expect(r).toEqual({ latency: null, jitter: null, packetLoss: 100 });
  });

  it('a single answered ping has zero jitter', async () => {
    fakeNetwork([5, 42, null, null, null, null, null, null, null, null, null]);
    const r = await settle(speedTester.measureLatencyAndJitter('https://speed.example.com'));
    expect(r).toEqual({ latency: 42, jitter: 0, packetLoss: 90 });
  });

  it('counts a ping with an error status as lost', async () => {
    (globalThis as any).fetch = jest.fn(async () => ({ ok: false }));
    const r = await settle(speedTester.measureLatencyAndJitter('https://speed.example.com'));
    expect(r.packetLoss).toBe(100);
  });
});

describe('resolvePublicISP', () => {
  it.each([
    ['Reliance Jio Infocomm Limited', 'Jio'],
    ['Bharti Airtel Ltd.', 'Airtel'],
    ['Bharat Sanchar Nigam Limited', 'BSNL'],
    ['Vodafone Idea Ltd', 'Vi'],
    ['Atria Convergence Technologies', 'ACT Fibernet'],
    ['Tata Teleservices', 'Tata Play Fiber'],
    ['Hathway IP Over Cable', 'Hathway'],
    ['Excitel Broadband', 'Excitel'],
    ['Small ISP', 'Small ISP'],
    ['A Very Long Internet Provider Name Pvt Ltd', 'A Very Long Internet'],
  ])('%p is shown as %p', async (isp, expected) => {
    fakeNetwork([], isp);
    expect(await resolvePublicISP(true)).toBe(expected);
  });

  it('returns null when the lookup fails', async () => {
    (globalThis as any).fetch = jest.fn(async () => {
      throw new Error('offline');
    });
    expect(await resolvePublicISP(true)).toBeNull();
  });

  it('returns null when the lookup has no provider', async () => {
    (globalThis as any).fetch = jest.fn(async () => ({ ok: true, json: async () => ({ success: false }) }));
    expect(await resolvePublicISP(true)).toBeNull();
  });

  it('reuses a recent answer unless asked for a fresh one', async () => {
    fakeNetwork([], 'Bharti Airtel');
    await resolvePublicISP(true);
    const lookups = (globalThis as any).fetch as jest.Mock;
    expect(await resolvePublicISP()).toBe('Airtel');
    expect(lookups).toHaveBeenCalledTimes(1);
    await resolvePublicISP(true);
    expect(lookups).toHaveBeenCalledTimes(2);
  });
});

describe('rateSignal', () => {
  it.each([
    [-80, 'cellular', 'Excellent'],
    [-85, 'cellular', 'Excellent'],
    [-90, 'cellular', 'Better'],
    [-100, 'cellular', 'Good'],
    [-110, 'cellular', 'Poor'],
    [-50, 'wifi', 'Excellent'],
    [-60, 'wifi', 'Better'],
    [-70, 'wifi', 'Good'],
    [-80, 'wifi', 'Poor'],
  ])('%p dBm on %p is %p', (dbm, network, rating) => {
    expect(rateSignal(dbm as number, network as string)).toBe(rating);
  });
});

describe('getNetworkContext', () => {
  it('Wi-Fi: uses the broadband provider and the Wi-Fi signal', async () => {
    fakeNetwork([], 'Atria Convergence');
    netInfoFetch.mockResolvedValue({ type: 'wifi', isConnected: true });
    NativeModules.TelephonyModule = { getWifiInfo: jest.fn(async () => ({ signalDbm: -58 })) };
    const net = await settle(speedTester.getNetworkContext());
    expect(net).toMatchObject({ network: 'wifi', radio: 'Wi-Fi', carrier: 'ACT Fibernet', isConnected: true });
    expect(net.signal).toMatchObject({ signal_dbm: -58, signal_quality: 'Better' });
  });

  it('cellular: uses the SIM operator and radio from the phone', async () => {
    netInfoFetch.mockResolvedValue({ type: 'cellular', isConnected: true, details: null });
    NativeModules.TelephonyModule = {
      getCellularInfo: jest.fn(async () => ({ carrier: 'Airtel', radio: '5G', signalDbm: -88 })),
    };
    const net = await settle(speedTester.getNetworkContext());
    expect(net).toMatchObject({ network: 'cellular', radio: '5G', carrier: 'Airtel' });
    expect(net.signal.signal_quality).toBe('Better');
  });

  it('cellular: falls back to NetInfo details, then to the public provider lookup', async () => {
    netInfoFetch.mockResolvedValue({ type: 'cellular', isConnected: true, details: { cellularGeneration: '4g' } });
    fakeNetwork([], 'Reliance Jio');
    const net = await settle(speedTester.getNetworkContext());
    expect(net).toMatchObject({ radio: '4G', carrier: 'Jio' });
  });

  it('cellular: a slow radio query does not hold up the test', async () => {
    netInfoFetch.mockResolvedValue({ type: 'cellular', isConnected: true, details: { carrier: 'Vi' } });
    NativeModules.TelephonyModule = { getCellularInfo: jest.fn(() => new Promise(() => {})) };
    const net = await settle(speedTester.getNetworkContext());
    expect(net.carrier).toBe('Vi');
  });

  it('ethernet', async () => {
    netInfoFetch.mockResolvedValue({ type: 'ethernet', isConnected: true });
    fakeNetwork([], 'Hathway');
    const net = await settle(speedTester.getNetworkContext());
    expect(net).toMatchObject({ network: 'ethernet', radio: 'Ethernet', carrier: 'Hathway' });
  });

  it('offline', async () => {
    netInfoFetch.mockResolvedValue({ type: 'none', isConnected: false });
    const net = await settle(speedTester.getNetworkContext());
    expect(net).toMatchObject({ network: 'none', isConnected: false, carrier: null, radio: null });
  });

  it('never stores the "--" placeholder as an operator', async () => {
    netInfoFetch.mockResolvedValue({ type: 'cellular', isConnected: true, details: null });
    NativeModules.TelephonyModule = { getCellularInfo: jest.fn(async () => ({ carrier: '--' })) };
    (globalThis as any).fetch = jest.fn(async () => {
      throw new Error('offline');
    });
    const net = await settle(speedTester.getNetworkContext());
    expect(net.carrier).toBeNull();
  });
});

describe('runFullTest', () => {
  beforeEach(() => {
    netInfoFetch.mockResolvedValue({ type: 'wifi', isConnected: true });
    fakeNetwork([5, ...Array(10).fill(25)], 'Bharti Airtel');
    throughput.mockImplementation(async (direction: string, _url: string, onSpeed?: (v: number) => void) => {
      onSpeed?.(direction === 'download' ? 48 : 19);
      return direction === 'download' ? 50.5 : 20.25;
    });
  });

  it('runs ping, download, then upload and returns every value', async () => {
    const result = await settle(speedTester.runFullTest(config));
    expect(result).toMatchObject({
      latency: 25,
      jitter: 0,
      packetLoss: 0,
      downMbps: 50.5,
      upMbps: 20.25,
      networkType: 'wifi',
      radioTech: 'Wi-Fi',
      carrier: 'Airtel',
    });
    expect(throughput.mock.calls.map(c => [c[0], c[1]])).toEqual([
      ['download', config.serverUrl],
      ['upload', config.serverUrl],
    ]);
  });

  it('reports progress in order, including live speeds', async () => {
    const progress: SpeedTestProgress[] = [];
    await settle(speedTester.runFullTest(config, p => progress.push(p)));
    expect(progress.map(p => [p.phase, p.progressPercent])).toEqual([
      ['ping', 15],
      ['download', 30],
      ['download', 45],
      ['upload', 65],
      ['upload', 80],
      ['complete', 100],
    ]);
    expect(progress[2].downSpeed).toBe(48);
    expect(progress[4]).toMatchObject({ downSpeed: 50.5, upSpeed: 19 });
    expect(progress[5]).toMatchObject({ latency: 25, downSpeed: 50.5, upSpeed: 20.25 });
  });

  it('stops with an error when offline', async () => {
    netInfoFetch.mockResolvedValue({ type: 'none', isConnected: false });
    const progress: SpeedTestProgress[] = [];
    const run = speedTester.runFullTest(config, p => progress.push(p));
    const assertion = expect(run).rejects.toThrow('No internet connection');
    await jest.advanceTimersByTimeAsync(1000);
    await assertion;
    expect(progress).toEqual([expect.objectContaining({ phase: 'error' })]);
    expect(throughput).not.toHaveBeenCalled();
  });

  it('skips the test on mobile data in Wi-Fi only mode', async () => {
    netInfoFetch.mockResolvedValue({ type: 'cellular', isConnected: true, details: { carrier: 'Jio' } });
    const run = speedTester.runFullTest({ ...config, wifiOnly: true });
    const assertion = expect(run).rejects.toThrow('Wi-Fi only mode enabled');
    await jest.advanceTimersByTimeAsync(5000);
    await assertion;
    expect(throughput).not.toHaveBeenCalled();
  });

  it('still returns ping results when download and upload fail', async () => {
    throughput.mockResolvedValue(null);
    const result = await settle(speedTester.runFullTest(config));
    expect(result.downMbps).toBeNull();
    expect(result.upMbps).toBeNull();
    expect(result.latency).toBe(25);
  });
});
