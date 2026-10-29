import { Platform } from 'react-native';
import { GeoLocationResult, Sample } from '../types';
import { speedTester } from './speedTester';
import { classifyExperience, ExperienceCategory } from '../config/coverageThresholds';

/**
 * Network Experience Coverage: one measurement cycle.
 *
 * Measures what public APIs genuinely expose on both platforms: connection
 * path/radio/carrier, latency/jitter/loss and a light download. RF values
 * (RSRP, cell ID, band) are NOT measured here and are always returned as null.
 */

// Smallest payload the /download endpoint serves; keeps each cycle light.
export const COVERAGE_DOWNLOAD_MB = 1;
// A GPS fix older than this is not attributed to the current measurement point.
export const MAX_LOCATION_AGE_MS = 30_000;

export type CoverageFailureReason =
  | 'no_path'
  | 'timeout'
  | 'http_error'
  | 'location_unavailable'
  | 'error';

export type CoverageStage = 'network' | 'latency' | 'throughput' | 'location';

export interface CoverageProgress {
  stage: CoverageStage;
  radio?: string | null;
  carrier?: string | null;
  latencyMs?: number | null;
  downMbps?: number | null;
  location?: GeoLocationResult;
}

export interface CoverageMeasurement {
  experience: ExperienceCategory;
  connected: boolean;
  network: string;
  radio: string | null;
  carrier: string | null;
  downMbps: number | null;
  latencyMs: number | null;
  jitterMs: number | null;
  packetLossPct: number | null;
  location: GeoLocationResult;
  failureReason: CoverageFailureReason | null;
  bytesUsed: number;
}

export interface MeasureCoverageOptions {
  serverUrl: string;
  /** Resolves the GPS fix for this measurement (called after the network probes). */
  getLocation: () => Promise<GeoLocationResult>;
  /** False skips the download (e.g. data cap reached); latency is still measured. */
  allowThroughput?: boolean;
  onProgress?: (p: CoverageProgress) => void;
}

const NO_LOCATION: GeoLocationResult = { lat: null, lng: null, accuracy: null };

/** True when a fix exists and is recent enough to describe the current position. */
export function isFreshLocation(
  loc: GeoLocationResult | null | undefined,
  now: number = Date.now(),
  maxAgeMs: number = MAX_LOCATION_AGE_MS
): loc is GeoLocationResult {
  if (!loc || loc.lat == null || loc.lng == null) return false;
  if (loc.timestamp == null) return false;
  return now - loc.timestamp <= maxAgeMs;
}

/** Runs one measurement. Never throws: failures are returned in failureReason. */
export async function measureCoverage(opts: MeasureCoverageOptions): Promise<CoverageMeasurement> {
  const { serverUrl, getLocation, allowThroughput = true, onProgress } = opts;

  let network = 'none';
  let radio: string | null = null;
  let carrier: string | null = null;
  let isConnected = false;
  let ping: { latency: number | null; jitter: number | null; packetLoss: number } = {
    latency: null,
    jitter: null,
    packetLoss: 100,
  };
  let downMbps: number | null = null;
  let bytesUsed = 0;
  let failureReason: CoverageFailureReason | null = null;

  try {
    onProgress?.({ stage: 'network' });
    const net = await speedTester.getNetworkContext();
    network = net.network;
    radio = net.radio;
    carrier = net.carrier;
    isConnected = net.isConnected && net.network !== 'none';
    onProgress?.({ stage: 'network', radio, carrier });

    if (!isConnected) {
      failureReason = 'no_path';
    } else {
      onProgress?.({ stage: 'latency' });
      ping = await speedTester.measureLatencyAndJitter(serverUrl);
      onProgress?.({ stage: 'latency', latencyMs: ping.latency });

      if (ping.packetLoss >= 100) {
        failureReason = 'timeout';
      } else if (allowThroughput) {
        onProgress?.({ stage: 'throughput' });
        downMbps = await speedTester.measureDownload(serverUrl, COVERAGE_DOWNLOAD_MB);
        bytesUsed += COVERAGE_DOWNLOAD_MB * 1024 * 1024;
        onProgress?.({ stage: 'throughput', downMbps });
        if (downMbps == null) failureReason = 'http_error';
      }
    }
  } catch (err) {
    console.warn('Coverage measurement error:', err);
    failureReason = failureReason ?? 'error';
  }

  let location = NO_LOCATION;
  try {
    onProgress?.({ stage: 'location' });
    location = await getLocation();
    onProgress?.({ stage: 'location', location });
  } catch (err) {
    console.warn('Coverage location error:', err);
  }
  if (location.lat == null && !failureReason) failureReason = 'location_unavailable';

  const connected = isConnected && ping.packetLoss < 100;
  return {
    experience: classifyExperience({
      connected,
      downMbps,
      latencyMs: ping.latency,
      packetLossPct: connected ? ping.packetLoss : null,
      locationAccuracyM: location.accuracy,
    }),
    connected,
    network,
    radio,
    carrier,
    downMbps,
    latencyMs: ping.latency,
    jitterMs: ping.jitter,
    packetLossPct: connected ? ping.packetLoss : null,
    location,
    failureReason,
    bytesUsed,
  };
}

/** Sample fields for a measurement. RF fields are null: they were not measured. */
export function coverageSampleFields(m: CoverageMeasurement): Partial<Sample> {
  return {
    down_mbps: m.downMbps,
    up_mbps: null,
    latency_ms: m.latencyMs,
    jitter_ms: m.jitterMs,
    packet_loss_pct: m.packetLossPct,
    network: m.network,
    radio: m.radio,
    carrier: m.carrier,
    lat: m.location.lat,
    lng: m.location.lng,
    accuracy: m.location.accuracy,
    location_ts: m.location.timestamp != null ? m.location.timestamp / 1000 : null,
    speed_mps: m.location.speed ?? null,
    signal_dbm: null,
    signal_quality: null,
    cell_tower: null,
    frequency_band: null,
    measurement_source:
      Platform.OS === 'ios' ? 'ios_network_experience' : 'android_network_experience',
    quality_category: m.experience,
    failure_reason: m.failureReason,
  };
}
