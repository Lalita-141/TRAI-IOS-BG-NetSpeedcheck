/**
 * Network Experience classification.
 *
 * These thresholds grade MEASURED internet performance (throughput, latency,
 * packet loss). They are NOT telecom RF thresholds and must never be presented
 * as signal strength. iOS exposes no public API for RSRP/RSRQ/SINR/RSSI, so RF
 * values stay null unless a platform genuinely measures them.
 */

import { Platform } from 'react-native';

/** Display text for an RF signal value: real dBm, or an honest "unavailable" label. */
export function formatRfSignal(signalDbm: number | null | undefined): string {
  if (signalDbm != null) return `${signalDbm} dBm`;
  return Platform.OS === 'ios' ? 'Not available on iOS' : 'Not measured';
}

export type ExperienceCategory = 'no_service' | 'poor' | 'fair' | 'good' | 'excellent' | 'unrated';

export interface ExperienceThresholds {
  poorMaxDownMbps: number; // below this => poor
  fairMaxDownMbps: number; // below this => fair
  goodMaxDownMbps: number; // below this => good, otherwise excellent (if latency allows)
  poorMinLatencyMs: number; // above this => poor
  fairMinLatencyMs: number; // above this => fair
  excellentMaxLatencyMs: number; // excellent also requires latency at or below this
  poorMinLossPct: number; // above this => poor
  maxLocationAccuracyM: number; // worse GPS accuracy => unrated
}

export const DEFAULT_EXPERIENCE_THRESHOLDS: ExperienceThresholds = {
  poorMaxDownMbps: 2,
  fairMaxDownMbps: 10,
  goodMaxDownMbps: 25,
  poorMinLatencyMs: 300,
  fairMinLatencyMs: 100,
  excellentMaxLatencyMs: 50,
  poorMinLossPct: 10,
  maxLocationAccuracyM: 100,
};

export interface ExperienceInput {
  connected: boolean;
  downMbps: number | null;
  latencyMs: number | null;
  packetLossPct: number | null;
  locationAccuracyM: number | null;
}

export function classifyExperience(
  m: ExperienceInput,
  t: ExperienceThresholds = DEFAULT_EXPERIENCE_THRESHOLDS
): ExperienceCategory {
  if (m.locationAccuracyM == null || m.locationAccuracyM > t.maxLocationAccuracyM) {
    return 'unrated';
  }
  if (!m.connected || (m.packetLossPct != null && m.packetLossPct >= 100)) {
    return 'no_service';
  }
  if (m.downMbps == null && m.latencyMs == null) {
    return 'no_service';
  }
  if (
    (m.downMbps != null && m.downMbps < t.poorMaxDownMbps) ||
    (m.latencyMs != null && m.latencyMs > t.poorMinLatencyMs) ||
    (m.packetLossPct != null && m.packetLossPct > t.poorMinLossPct)
  ) {
    return 'poor';
  }
  if (
    (m.downMbps != null && m.downMbps < t.fairMaxDownMbps) ||
    (m.latencyMs != null && m.latencyMs > t.fairMinLatencyMs)
  ) {
    return 'fair';
  }
  // Without a throughput measurement we cannot claim good/excellent
  if (m.downMbps == null) {
    return 'fair';
  }
  if (m.downMbps < t.goodMaxDownMbps) {
    return 'good';
  }
  return m.latencyMs != null && m.latencyMs <= t.excellentMaxLatencyMs ? 'excellent' : 'good';
}

export const EXPERIENCE_LABELS: Record<ExperienceCategory, string> = {
  no_service: 'No Service',
  poor: 'Poor',
  fair: 'Fair',
  good: 'Good',
  excellent: 'Excellent',
  unrated: 'Unrated (low GPS accuracy)',
};

export const EXPERIENCE_COLORS: Record<ExperienceCategory, string> = {
  no_service: '#7F1D1D',
  poor: '#EF4444',
  fair: '#F59E0B',
  good: '#06B6D4',
  excellent: '#10B981',
  unrated: '#94A3B8',
};
