import { Platform } from 'react-native';
import { GeoLocationResult, Sample } from '../types';
import { getConfig, getDeviceId } from '../config';
import { generateUUID } from '../utils/uuid';
import { sampleStore } from './sampleStore';
import { uploader } from './uploader';
import { speedTester } from './speedTester';
import { locationService } from './locationService';
import { measureVideo, measureWeb } from './qosProbes';
import { testCoordinator } from './testCoordinator';

export interface CoverageTestResults {
  connected: boolean;
  radioTech: string | null;
  carrierName: string | null;
  latencyMs: number | null;
  packetLossPct: number | null;
  gpsAccuracy: number | null;
  // Only filled when the phone exposes them: Android yes, iOS has no public API
  signalDbm: number | null;
  signalQuality: string | null;
  cellTower: string | null;
  frequencyBand: string | null;
}

export interface VideoBrowserTestResults {
  videoDelayMs: number | null;
  videoMbps: number | null;
  streamingQuality: string | null;
  webDelayMs: number | null;
  ttfbMs: number | null;
  pageLoadSec: number | null;
  error: string | null;
}

async function buildBaseSample(testType: string, loc: GeoLocationResult): Promise<Sample> {
  const config = await getConfig();
  return {
    id: generateUUID(),
    device_id: await getDeviceId(),
    ts: Math.floor(Date.now() / 1000),
    down_mbps: null,
    up_mbps: null,
    latency_ms: null,
    jitter_ms: null,
    packet_loss_pct: null,
    network: null,
    radio: null,
    carrier: null,
    device_model: Platform.OS === 'ios' ? 'Apple iPhone' : 'Android Device',
    os_platform: `${Platform.OS} ${Platform.Version}`,
    location_type: config.testLabel ?? null,
    lat: loc.lat,
    lng: loc.lng,
    accuracy: loc.accuracy,
    test_type: testType,
  };
}

async function save(sample: Sample) {
  await sampleStore.add(sample);
  await uploader.flush().catch(() => undefined);
}

/**
 * Coverage test: what the current location's connection really is. It measures no
 * speed, so speed fields stay empty. "No service" is a valid result (a dead zone) and is saved.
 */
export async function runCoverageTest(
  onPhase?: (phase: 'network' | 'gps', partial: Partial<CoverageTestResults>) => void
): Promise<{ results: CoverageTestResults; sample: Sample }> {
  const config = await getConfig();

  onPhase?.('network', {});
  const { net, ping } = await testCoordinator.run('manual', async () => {
    const context = await speedTester.getNetworkContext();
    const pingResult = context.isConnected
      ? await speedTester.measureLatencyAndJitter(config.serverUrl)
      : { latency: null, jitter: null, packetLoss: 100 };
    return { net: context, ping: pingResult };
  });

  const connected = net.isConnected && ping.packetLoss < 100;
  const partial: Partial<CoverageTestResults> = {
    connected,
    radioTech: net.radio,
    carrierName: net.carrier,
    latencyMs: ping.latency,
    packetLossPct: ping.packetLoss,
    signalDbm: net.signal.signal_dbm,
    signalQuality: net.signal.signal_quality,
    cellTower: net.signal.cell_tower,
    frequencyBand: net.signal.frequency_band,
  };

  onPhase?.('gps', partial);
  const loc = await locationService.getCurrentLocation();

  const sample: Sample = {
    ...(await buildBaseSample('coverage', loc)),
    latency_ms: ping.latency,
    jitter_ms: ping.jitter,
    packet_loss_pct: ping.packetLoss,
    network: net.network,
    radio: net.radio,
    carrier: net.carrier,
    ...net.signal,
  };
  await save(sample);

  return {
    sample,
    results: {
      ...(partial as Omit<CoverageTestResults, 'gpsAccuracy'>),
      gpsAccuracy: loc.accuracy != null ? Math.round(loc.accuracy) : null,
    },
  };
}

/**
 * Video & browser test. A result with an error or with nothing measured is not saved.
 */
export async function runVideoBrowserTest(
  onPhase?: (phase: 'video' | 'web', partial: Partial<VideoBrowserTestResults>) => void
): Promise<{ results: VideoBrowserTestResults; sample: Sample | null }> {
  const empty: VideoBrowserTestResults = {
    videoDelayMs: null,
    videoMbps: null,
    streamingQuality: null,
    webDelayMs: null,
    ttfbMs: null,
    pageLoadSec: null,
    error: null,
  };
  const config = await getConfig();

  const net = await speedTester.getNetworkContext();
  if (!net.isConnected || net.network === 'none') {
    return { results: { ...empty, error: 'No internet connection' }, sample: null };
  }
  if (config.wifiOnly && net.network !== 'wifi') {
    return { results: { ...empty, error: 'Wi-Fi only mode is on' }, sample: null };
  }

  const measured = await testCoordinator.run('manual', async () => {
    onPhase?.('video', {});
    const video = await measureVideo(config.serverUrl);
    onPhase?.('web', video);
    const web = await measureWeb(config.serverUrl);
    return { ...video, ...web };
  });

  const results: VideoBrowserTestResults = {
    ...empty,
    ...measured,
    webDelayMs: measured.pageLoadSec != null ? Math.round(measured.pageLoadSec * 1000) : null,
  };
  if (results.videoDelayMs == null && results.pageLoadSec == null) {
    return { results: { ...results, error: 'Test server unreachable' }, sample: null };
  }

  const loc = await locationService.getCurrentLocation();
  const sample: Sample = {
    ...(await buildBaseSample('video', loc)),
    down_mbps: results.videoMbps,
    latency_ms: results.ttfbMs,
    network: net.network,
    radio: net.radio,
    carrier: net.carrier,
    ...net.signal,
    video_delay_ms: results.videoDelayMs,
    web_delay_ms: results.webDelayMs,
    page_load_sec: results.pageLoadSec,
    ttfb_ms: results.ttfbMs,
    streaming_quality: results.streamingQuality,
  };
  await save(sample);
  return { results, sample };
}
