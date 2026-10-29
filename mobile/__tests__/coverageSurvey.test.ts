// Network and GPS are mocked here only; production measurements are never mocked.
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}));
jest.mock('@react-native-community/netinfo', () => ({ fetch: jest.fn(), NetInfoStateType: {} }));
jest.mock('@react-native-community/geolocation', () => ({}));
jest.mock('../src/services/speedTester', () => ({
  speedTester: {
    getNetworkContext: jest.fn(),
    measureLatencyAndJitter: jest.fn(),
    measureDownload: jest.fn(),
  },
}));

import { speedTester } from '../src/services/speedTester';
import {
  coverageSampleFields,
  isFreshLocation,
  measureCoverage,
  MAX_LOCATION_AGE_MS,
} from '../src/services/coverageSurvey';
import { GeoLocationResult } from '../src/types';

const st = speedTester as jest.Mocked<typeof speedTester>;
const goodFix: GeoLocationResult = { lat: 28.6, lng: 77.2, accuracy: 8, timestamp: Date.now(), speed: 1.4 };
const getLocation = jest.fn(async () => goodFix);

const cellular = { network: 'cellular', radio: '5G', carrier: 'Jio', isConnected: true };

beforeEach(() => {
  jest.clearAllMocks();
  st.getNetworkContext.mockResolvedValue(cellular);
  st.measureLatencyAndJitter.mockResolvedValue({ latency: 30, jitter: 4, packetLoss: 0 });
  st.measureDownload.mockResolvedValue(42);
});

describe('measureCoverage', () => {
  it('records measured performance and classifies it', async () => {
    const m = await measureCoverage({ serverUrl: 'http://srv', getLocation });
    expect(m).toMatchObject({
      connected: true,
      downMbps: 42,
      latencyMs: 30,
      packetLossPct: 0,
      experience: 'excellent',
      failureReason: null,
      bytesUsed: 1024 * 1024,
    });
  });

  it('records a no-path failure without probing the network', async () => {
    st.getNetworkContext.mockResolvedValue({ network: 'none', radio: null, carrier: null, isConnected: false });
    const m = await measureCoverage({ serverUrl: 'http://srv', getLocation });
    expect(m.failureReason).toBe('no_path');
    expect(m.experience).toBe('no_service');
    expect(m.location).toEqual(goodFix); // the dead zone is still located
    expect(st.measureLatencyAndJitter).not.toHaveBeenCalled();
  });

  it('records a timeout when every ping is lost and skips the download', async () => {
    st.measureLatencyAndJitter.mockResolvedValue({ latency: null, jitter: null, packetLoss: 100 });
    const m = await measureCoverage({ serverUrl: 'http://srv', getLocation });
    expect(m.failureReason).toBe('timeout');
    expect(m.experience).toBe('no_service');
    expect(m.packetLossPct).toBeNull();
    expect(st.measureDownload).not.toHaveBeenCalled();
  });

  it('records an http_error when the download fails', async () => {
    st.measureDownload.mockResolvedValue(null);
    const m = await measureCoverage({ serverUrl: 'http://srv', getLocation });
    expect(m.failureReason).toBe('http_error');
    expect(m.downMbps).toBeNull();
  });

  it('skips throughput when the data cap disallows it', async () => {
    const m = await measureCoverage({ serverUrl: 'http://srv', getLocation, allowThroughput: false });
    expect(st.measureDownload).not.toHaveBeenCalled();
    expect(m.bytesUsed).toBe(0);
    expect(m.experience).toBe('fair'); // never good/excellent without throughput
  });

  it('never throws: unexpected errors become a failure reason', async () => {
    st.getNetworkContext.mockRejectedValue(new Error('boom'));
    const m = await measureCoverage({ serverUrl: 'http://srv', getLocation });
    expect(m.failureReason).toBe('error');
  });

  it('flags a missing GPS fix as location_unavailable and leaves it unrated', async () => {
    const m = await measureCoverage({
      serverUrl: 'http://srv',
      getLocation: async () => ({ lat: null, lng: null, accuracy: null }),
    });
    expect(m.failureReason).toBe('location_unavailable');
    expect(m.experience).toBe('unrated');
  });
});

describe('coverageSampleFields', () => {
  it('never fills RF fields and tags the measurement source', async () => {
    const m = await measureCoverage({ serverUrl: 'http://srv', getLocation });
    const f = coverageSampleFields(m);
    expect(f.signal_dbm).toBeNull();
    expect(f.cell_tower).toBeNull();
    expect(f.frequency_band).toBeNull();
    expect(f.measurement_source).toMatch(/_network_experience$/);
    expect(f.quality_category).toBe('excellent');
    expect(f.location_ts).toBeCloseTo(goodFix.timestamp! / 1000);
    expect(f.speed_mps).toBe(1.4);
  });
});

describe('isFreshLocation', () => {
  const now = 1_000_000_000_000;
  it('accepts a recent fix', () => {
    expect(isFreshLocation({ ...goodFix, timestamp: now - 5_000 }, now)).toBe(true);
  });
  it('rejects stale, untimestamped or empty fixes', () => {
    expect(isFreshLocation({ ...goodFix, timestamp: now - MAX_LOCATION_AGE_MS - 1 }, now)).toBe(false);
    expect(isFreshLocation({ ...goodFix, timestamp: null }, now)).toBe(false);
    expect(isFreshLocation({ lat: null, lng: null, accuracy: null, timestamp: now }, now)).toBe(false);
    expect(isFreshLocation(null, now)).toBe(false);
  });
});
