/**
 * Continuous test results screen (src/components/ContinuousTestResultView.tsx): the last test's full
 * result (like a single test result), the session summary, and every value of every cycle.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}));
jest.mock('react-native-webview', () => {
  const ReactLib = require('react');
  return { WebView: (props: any) => ReactLib.createElement('WebView', props) };
});
jest.mock('react-native-svg', () => {
  const ReactLib = require('react');
  const el = (name: string) => (props: any) => ReactLib.createElement(name, props, props.children);
  return new Proxy({ __esModule: true, default: el('Svg') }, { get: (t: any, k: string) => (k in t ? t[k] : el(k)) });
});
jest.mock('../src/services/geocodeService', () => ({ reverseGeocode: jest.fn(async () => 'Pune, Maharashtra') }));
jest.mock('../src/config', () => ({ getConfig: jest.fn(async () => ({ serverUrl: 'https://netspeed.handt.ai' })) }));

import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { ContinuousTestResultView } from '../src/components/ContinuousTestResultView';
import { ContinuousTestSessionResults, CycleResult } from '../src/components/ContinuousTestProgressView';
import { Sample } from '../src/types';

const TS = Math.floor(new Date(2026, 10, 16, 15, 57).getTime() / 1000);

const sample = (over: Partial<Sample> = {}): Sample => ({
  id: 'abc123de-0000-4000-8000-000000000000',
  device_id: 'device-1',
  ts: TS,
  down_mbps: 173.53,
  up_mbps: 129.06,
  latency_ms: 16,
  jitter_ms: 3.93,
  packet_loss_pct: 0,
  network: 'wifi',
  radio: 'Wi-Fi',
  carrier: 'BSNL',
  signal_dbm: null,
  lat: 18.55017,
  lng: 73.94095,
  accuracy: 5,
  test_type: 'continuous',
  ...over,
});

const cycle = (n: number, s: Sample | null | undefined, failed = false): CycleResult => ({
  cycleNumber: n,
  timestamp: '03:57:00 PM',
  primaryMetric: failed ? 'Failed' : 'x',
  primaryLabel: 'Download',
  secondaryMetric: 'y',
  secondaryLabel: 'Upload',
  extraInfo: failed ? 'No internet connection' : 'Ping: 16 ms',
  numericVal: 0,
  failed,
  sample: s,
});

const results = (testType: any, cycles: CycleResult[]): ContinuousTestSessionResults => ({
  testType,
  durationMinsPlanned: 5,
  totalSecondsElapsed: 98,
  totalCyclesCompleted: cycles.length,
  stoppedByUser: true,
  cycles,
  summary: {
    stat1Label: 'Avg Download',
    stat1Value: '150.0 Mbps',
    stat2Label: 'Peak Download',
    stat2Value: '173.5 Mbps',
    stat3Label: 'Avg Upload',
    stat3Value: '120.0 Mbps',
    stat4Label: 'Avg Latency',
    stat4Value: '18 ms',
  },
});

async function render(r: ContinuousTestSessionResults) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = ReactTestRenderer.create(<ContinuousTestResultView results={r} onBackToHome={jest.fn()} onRestartTest={jest.fn()} />);
  });
  const text = tree.root
    .findAllByType(Text)
    .map(t => [].concat(t.props.children).filter((c: any) => typeof c === 'string' || typeof c === 'number').join(''))
    .join('\n');
  return { tree, text };
}

describe('speed session', () => {
  it('shows the last test with every value, like the single test result', async () => {
    const older = sample({ id: 'old00000', down_mbps: 90.1, up_mbps: 40.2 });
    const { text, tree } = await render(results('speed', [cycle(2, sample()), cycle(1, older)]));

    expect(text).toContain('Last Test Result');
    ['173.53', '129.06', 'Download Speed', 'Upload Speed'].forEach(v => expect(text).toContain(v));
    ['Latency', '16 ms', 'Packet Loss', '0.00 %', 'Jitter', '3.93 ms'].forEach(v => expect(text).toContain(v));
    ['Connection', 'Wi-Fi', 'Tech', 'Operator', 'BSNL', 'Date', 'November 16, 2026', 'Time', 'Test ID', 'ABC123'].forEach(v =>
      expect(text).toContain(v)
    );
    ['Test Server', 'netspeed.handt.ai', 'Location', 'Pune, Maharashtra', '18.550170', '73.940950'].forEach(v =>
      expect(text).toContain(v)
    );
    expect(text).toMatch(/03:57\sPM/);
    expect(text).toContain('from the last test only');
    expect(tree.root.findAllByType('WebView' as any)).toHaveLength(1); // location map
  });

  it('keeps the session summary and lists every value of every cycle', async () => {
    const older = sample({ id: 'old00000', down_mbps: 90.1, up_mbps: 40.2, latency_ms: 22, jitter_ms: 1.5, packet_loss_pct: 10 });
    const { text } = await render(results('speed', [cycle(2, sample()), cycle(1, older)]));
    ['Session Aggregate Summary', 'Avg Download', '150.0 Mbps', 'Cycles Breakdown (2)'].forEach(v => expect(text).toContain(v));
    ['90.10 Mbps', '40.20 Mbps', '22 ms', '1.50 ms', '10%'].forEach(v => expect(text).toContain(v));
  });

  it('uses the newest cycle that measured something when the last one failed', async () => {
    const { text } = await render(results('speed', [cycle(2, null, true), cycle(1, sample())]));
    expect(text).toContain('173.53');
    expect(text).toContain('Failed');
  });

  it('shows "--" for values a cycle did not measure, never 0', async () => {
    const { text } = await render(results('speed', [cycle(1, sample({ up_mbps: null, jitter_ms: null }))]));
    expect(text).toContain('-- Mbps');
    expect(text).toContain('-- ms');
  });

  it('works for sessions saved by an older version (no stored results)', async () => {
    const { text } = await render(results('speed', [cycle(1, undefined)]));
    expect(text).not.toContain('Last Test Result');
    expect(text).toContain('Cycles Breakdown (1)');
  });
});

describe('coverage session', () => {
  it('shows only latency, packet loss and jitter, with no download / upload boxes', async () => {
    const s = sample({ down_mbps: null, up_mbps: null, latency_ms: 42, jitter_ms: 2.1 });
    const { text } = await render(results('coverage', [cycle(1, s)]));
    ['Latency', '42 ms', 'Packet Loss', '0.00 %', 'Jitter', '2.10 ms', 'BSNL', 'Pune, Maharashtra'].forEach(v =>
      expect(text).toContain(v)
    );
    expect(text).not.toContain('Download Speed');
    expect(text).not.toContain('Upload Speed');
    expect(text).not.toContain('-- Mbps');
  });
});

describe('video & browsing session', () => {
  it('shows the video and web values instead of download / upload', async () => {
    const s = sample({
      down_mbps: 12.5,
      up_mbps: null,
      video_delay_ms: 310,
      ttfb_ms: 120,
      page_load_sec: 1.25,
      streaming_quality: '1080p Full HD',
    });
    const { text } = await render(results('video_browser', [cycle(1, s)]));
    ['Page Load Time', '1.25', 'Video Speed', '12.50', 'Video Start', '310 ms', 'TTFB', '120 ms', '1080p Full HD'].forEach(v =>
      expect(text).toContain(v)
    );
    expect(text).not.toContain('Upload Speed');
  });
});
