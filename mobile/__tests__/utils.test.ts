/**
 * CSV / JSON export, display helpers and device IDs (src/utils).
 */
jest.mock('../src/config', () => ({
  getConfig: jest.fn(async () => ({ serverUrl: 'https://netspeed.handt.ai:443/api' })),
}));

import { Alert, Platform, Share } from 'react-native';
import { exportSamplesAsCSV, exportSamplesAsJSON, generateCSV } from '../src/utils/exportUtils';
import {
  NOT_MEASURED,
  displayCarrier,
  displayRadio,
  displaySignal,
  signalUnavailableText,
  sampleKind,
} from '../src/utils/sampleDisplay';
import { generateUUID } from '../src/utils/uuid';
import { Sample } from '../src/types';

const sample = (over: Partial<Sample> = {}): Sample => ({
  id: 'id-1',
  device_id: 'device-1',
  ts: 1_700_000_000,
  down_mbps: 52.346,
  up_mbps: 11.2,
  latency_ms: 23.44,
  jitter_ms: 3.06,
  packet_loss_pct: 10,
  network: 'cellular',
  radio: '4G / LTE',
  carrier: 'Jio',
  device_model: 'Apple iPhone',
  os_platform: 'ios 18.0',
  location_type: 'Outdoor',
  lat: 19.0760123,
  lng: 72.8777456,
  accuracy: 12.34,
  ...over,
});

beforeEach(() => {
  jest.restoreAllMocks();
});

describe('generateCSV', () => {
  it('writes the header row and one row per test', () => {
    const lines = generateCSV([sample(), sample({ id: 'id-2' })]).split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(
      'ID,Timestamp,Date_Time_ISO,Carrier,Network_Type,Radio_Gen,Download_Mbps,Upload_Mbps,Latency_ms,' +
        'Jitter_ms,Packet_Loss_pct,Location_Environment,Latitude,Longitude,GPS_Accuracy_m,Device_Model,OS_Platform'
    );
  });

  it('formats values with fixed decimals and an ISO date', () => {
    const row = generateCSV([sample()]).split('\n')[1].split(',');
    expect(row).toEqual([
      'id-1',
      '1700000000',
      '2023-11-14T22:13:20.000Z',
      'Jio',
      'cellular',
      '4G / LTE',
      '52.35',
      '11.20',
      '23.4',
      '3.1',
      '10',
      'Outdoor',
      '19.076012',
      '72.877746',
      '12.3',
      'Apple iPhone',
      'ios 18.0',
    ]);
  });

  it('leaves values that were not measured empty, never 0', () => {
    const row = generateCSV([
      sample({ down_mbps: null, up_mbps: null, latency_ms: null, jitter_ms: null, lat: null, lng: null, accuracy: null, carrier: null }),
    ])
      .split('\n')[1]
      .split(',');
    expect(row[3]).toBe('');
    expect(row.slice(6, 10)).toEqual(['', '', '', '']);
    expect(row.slice(12, 15)).toEqual(['', '', '']);
  });

  it('quotes values that contain commas, quotes or line breaks', () => {
    const csv = generateCSV([sample({ carrier: 'Vi, "Idea"', location_type: 'Home\nFloor 2' })]);
    expect(csv).toContain('"Vi, ""Idea"""');
    expect(csv).toContain('"Home\nFloor 2"');
  });

  it('writes only the header for an empty list', () => {
    expect(generateCSV([]).split('\n')).toHaveLength(1);
  });
});

describe('export via the share sheet', () => {
  it('CSV: shares the file with a dated name', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as any);
    expect(await exportSamplesAsCSV([sample()])).toBe(true);
    const content = share.mock.calls[0][0] as any;
    expect(content.title).toMatch(/^NetSpeed_History_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.csv$/);
    expect(content.message).toBe(generateCSV([sample()]));
  });

  it('JSON: shares every sample with a count and date', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as any);
    expect(await exportSamplesAsJSON([sample(), sample({ id: 'id-2' })])).toBe(true);
    const content = share.mock.calls[0][0] as any;
    expect(content.title).toMatch(/\.json$/);
    const body = JSON.parse(content.message);
    expect(body.totalSamples).toBe(2);
    expect(body.samples.map((s: Sample) => s.id)).toEqual(['id-1', 'id-2']);
    expect(new Date(body.exportedAt).toString()).not.toBe('Invalid Date');
  });

  it.each([
    ['CSV', exportSamplesAsCSV],
    ['JSON', exportSamplesAsJSON],
  ])('%s: tells the user when there is nothing to export', async (_name, exporter) => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const share = jest.spyOn(Share, 'share');
    expect(await exporter([])).toBe(false);
    expect(alert).toHaveBeenCalledWith('Export Empty', expect.any(String));
    expect(share).not.toHaveBeenCalled();
  });

  it.each([
    ['CSV', exportSamplesAsCSV],
    ['JSON', exportSamplesAsJSON],
  ])('%s: shows an error when sharing fails', async (_name, exporter) => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.spyOn(Share, 'share').mockRejectedValue(new Error('Disk full'));
    expect(await exporter([sample()])).toBe(false);
    expect(alert).toHaveBeenCalledWith('Export Failed', 'Disk full');
  });

  it('stays quiet when the user closes the share sheet', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.spyOn(Share, 'share').mockRejectedValue(new Error('User did not share'));
    expect(await exportSamplesAsCSV([sample()])).toBe(false);
    expect(alert).not.toHaveBeenCalled();
  });
});

describe('sample display helpers', () => {
  it('operator: the real name, "Wi-Fi" on Wi-Fi, otherwise "--"', () => {
    expect(displayCarrier(sample({ carrier: 'Airtel' }))).toBe('Airtel');
    expect(displayCarrier(sample({ carrier: null, network: 'wifi' }))).toBe('Wi-Fi');
    expect(displayCarrier(sample({ carrier: 'wifi', network: 'wifi' }))).toBe('Wi-Fi');
    expect(displayCarrier(sample({ carrier: '--', network: 'cellular' }))).toBe(NOT_MEASURED);
    expect(displayCarrier(null)).toBe(NOT_MEASURED);
  });

  it('radio: the real value, "Wi-Fi" on Wi-Fi, otherwise "--"', () => {
    expect(displayRadio(sample({ radio: '5G' }))).toBe('5G');
    expect(displayRadio(sample({ radio: null, network: 'wifi' }))).toBe('Wi-Fi');
    expect(displayRadio(sample({ radio: null }))).toBe(NOT_MEASURED);
    expect(displayRadio(undefined)).toBe(NOT_MEASURED);
  });

  it('signal: rounded dBm, or why it is missing', () => {
    expect(displaySignal(sample({ signal_dbm: -97.6 }))).toBe('-98 dBm');
    expect(displaySignal(sample({ signal_dbm: null }))).toBe(signalUnavailableText());
  });

  it('explains that iOS does not report signal strength', () => {
    const original = Platform.OS;
    (Platform as any).OS = 'ios';
    expect(signalUnavailableText()).toBe('Not available on iOS');
    (Platform as any).OS = 'android';
    expect(signalUnavailableText()).toBe('Not available');
    (Platform as any).OS = original;
  });
});

describe('sampleKind (which values a History card and detail screen show)', () => {
  const video = { down_mbps: 52.27, up_mbps: null, jitter_ms: null, packet_loss_pct: null, video_delay_ms: 34, web_delay_ms: 50, ttfb_ms: 48, streaming_quality: '4K Ultra HD' };
  it('speed, scheduled and continuous speed results keep the speed layout', () => {
    expect(sampleKind(sample({ test_type: 'speed' }))).toBe('speed');
    expect(sampleKind(sample({ test_type: 'scheduled' }))).toBe('speed');
    expect(sampleKind(sample({ test_type: 'continuous' }))).toBe('speed');
    expect(sampleKind(sample({ test_type: undefined }))).toBe('speed');
  });
  it('a single video test and a continuous video cycle are video', () => {
    expect(sampleKind(sample({ test_type: 'video', ...video }))).toBe('video');
    expect(sampleKind(sample({ test_type: 'continuous', ...video }))).toBe('video');
  });
  it('a continuous coverage cycle (no download or upload) is coverage', () => {
    expect(sampleKind(sample({ test_type: 'continuous', down_mbps: null, up_mbps: null }))).toBe('coverage');
  });
  it('a single coverage test is unchanged', () => {
    expect(sampleKind(sample({ test_type: 'coverage', down_mbps: null, up_mbps: null }))).toBe('speed');
  });
});

describe('generateUUID', () => {
  it('creates RFC 4122 version 4 IDs', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateUUID()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });

  it('does not repeat', () => {
    const ids = new Set(Array.from({ length: 1000 }, generateUUID));
    expect(ids.size).toBe(1000);
  });
});
