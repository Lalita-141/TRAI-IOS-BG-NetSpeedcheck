jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}));
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: jest.fn() },
  NetInfoStateType: { wifi: 'wifi', cellular: 'cellular', ethernet: 'ethernet' },
}));
jest.mock('@react-native-community/geolocation', () => ({
  setRNConfiguration: jest.fn(),
  getCurrentPosition: jest.fn((ok: any) => ok({ coords: { latitude: 19.1, longitude: 72.9, accuracy: 12 } })),
}));

import NetInfo from '@react-native-community/netinfo';
import { NativeModules } from 'react-native';
import { speedTester, rateSignal } from '../src/services/speedTester';
import { runCoverageTest, runVideoBrowserTest } from '../src/services/singleTests';
import { reverseGeocode } from '../src/services/geocodeService';
import { sampleStore } from '../src/services/sampleStore';
import { uploader } from '../src/services/uploader';

declare const global: any;
declare const require: any;
declare const __dirname: string;
const fs = require('fs');
const path = require('path');

const offlineFetch = jest.fn(async () => {
  throw new Error('offline');
});
const netInfoFetch = NetInfo.fetch as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  (global as any).fetch = offlineFetch;
  jest.spyOn(uploader, 'flush').mockResolvedValue({ uploadedCount: 0, remainingPending: 0, success: true });
  jest.spyOn(sampleStore, 'add').mockResolvedValue();
  delete NativeModules.TelephonyModule;
});

describe('nothing is invented when a value cannot be measured', () => {
  it('leaves operator, radio and signal empty when the phone reports nothing', async () => {
    netInfoFetch.mockResolvedValue({ type: 'cellular', isConnected: true, details: null });
    const net = await speedTester.getNetworkContext();
    expect(net.carrier).toBeNull();
    expect(net.radio).toBeNull();
    expect(net.signal.signal_dbm).toBeNull();
  });

  it('a coverage test in a dead zone is saved as no service, with no invented numbers', async () => {
    netInfoFetch.mockResolvedValue({ type: 'cellular', isConnected: true, details: null });
    const { results, sample } = await runCoverageTest();

    expect(results.connected).toBe(false);
    expect(results.latencyMs).toBeNull();
    expect(results.signalDbm).toBeNull();
    expect(sample.packet_loss_pct).toBe(100);
    expect(sample.down_mbps).toBeNull();
    expect(sample.up_mbps).toBeNull();
    expect(sample.jitter_ms).toBeNull();
    expect(sample.carrier).toBeNull();
    expect(sample.location_type).toBeNull();
    expect(sample.lat).toBe(19.1);
    expect(sampleStore.add).toHaveBeenCalledWith(sample);
  });

  it('a coverage test saves the real signal the phone reports', async () => {
    netInfoFetch.mockResolvedValue({ type: 'cellular', isConnected: true, details: null });
    NativeModules.TelephonyModule = {
      getCellularInfo: jest.fn(async () => ({
        carrier: 'Airtel',
        radio: '4G / LTE',
        signalDbm: -97,
        cellTower: 'CI 123',
        frequencyBand: 'Band 3',
      })),
    };
    const { results, sample } = await runCoverageTest();
    expect(results.signalDbm).toBe(-97);
    expect(results.signalQuality).toBe('Good');
    expect(sample.signal_dbm).toBe(-97);
    expect(sample.cell_tower).toBe('CI 123');
    expect(sample.frequency_band).toBe('Band 3');
    expect(sample.carrier).toBe('Airtel');
  });

  it('a failed video & browser test saves nothing', async () => {
    netInfoFetch.mockResolvedValue({ type: 'wifi', isConnected: true, details: null });
    const { results, sample } = await runVideoBrowserTest();
    expect(sample).toBeNull();
    expect(results.error).toBeTruthy();
    expect(results.videoDelayMs).toBeNull();
    expect(results.webDelayMs).toBeNull();
    expect(results.streamingQuality).toBeNull();
    expect(sampleStore.add).not.toHaveBeenCalled();
  });

  it('a video & browser test saves only what it measured', async () => {
    netInfoFetch.mockResolvedValue({ type: 'wifi', isConnected: true, details: null });
    (global as any).fetch = jest.fn(async (url: string) => {
      if (url.includes('ipwho.is')) throw new Error('offline');
      return { ok: true, blob: async () => ({ size: url.includes('test-video') ? 2000000 : 200 }) };
    });
    const { results, sample } = await runVideoBrowserTest();
    expect(results.videoDelayMs).not.toBeNull();
    expect(results.pageLoadSec).not.toBeNull();
    expect(sample?.up_mbps).toBeNull();
    expect(sample?.jitter_ms).toBeNull();
    expect(sample?.packet_loss_pct).toBeNull();
    expect(sample?.carrier).toBeNull();
  });

  it('download speed is not assumed from the requested size', async () => {
    (global as any).fetch = jest.fn(async () => ({ ok: true, blob: async () => ({ size: 0 }) }));
    await expect(speedTester.measureDownload('https://x', 2)).resolves.toBeNull();
  });

  it('place names come only from the geocoder, otherwise real coordinates', async () => {
    await expect(reverseGeocode(18.55, 73.94)).resolves.toBe('Area (18.55°, 73.94°)');
    await expect(reverseGeocode(37.78, -122.4)).resolves.toBe('Area (37.78°, -122.40°)');
    await expect(reverseGeocode(null, null)).resolves.toBe('Location Unavailable');
  });
});

describe('rateSignal', () => {
  it('uses separate scales for cellular and Wi-Fi', () => {
    expect(rateSignal(-80, 'cellular')).toBe('Excellent');
    expect(rateSignal(-110, 'cellular')).toBe('Poor');
    expect(rateSignal(-80, 'wifi')).toBe('Poor');
  });
});

describe('source code has no invented values', () => {
  const BANNED = [
    'pseudoRandom',
    'Verified Grid',
    'Math.random',
    'Sector 04',
    'Band 40',
    'Core Server',
    'Broadband Gateway',
    'Streaming Cache Server',
    '37.7858',
    '-101 dBm',
    '-58 dBm',
    '-88 dBm',
    'Airtel Broadband',
    'Jio 5G',
    "|| 'Airtel'",
    'Simulating Buffer',
    'isSimulated',
    'TUTORIAL_VIDEOS',
  ];

  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry: any) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(full) : [full];
    });

  // Not mounted by the app; uuid.ts needs randomness
  const IGNORED = ['SettingsModal.tsx', 'HistoryModal.tsx', 'uuid.ts'];

  it.each(BANNED)('%s', banned => {
    const files = walk(path.join(__dirname, '../src')).filter(
      f => /\.tsx?$/.test(f) && !IGNORED.includes(path.basename(f))
    );
    const offenders = files.filter(f => fs.readFileSync(f, 'utf8').includes(banned));
    expect(offenders).toEqual([]);
  });
});
