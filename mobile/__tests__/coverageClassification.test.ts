import { Platform } from 'react-native';
import {
  classifyExperience,
  formatRfSignal,
  ExperienceInput,
} from '../src/config/coverageThresholds';

const base: ExperienceInput = {
  connected: true,
  downMbps: 30,
  latencyMs: 40,
  packetLossPct: 0,
  locationAccuracyM: 10,
};

describe('classifyExperience', () => {
  it('rates fast, low-latency measurements as excellent', () => {
    expect(classifyExperience(base)).toBe('excellent');
  });

  it('rates fast but high-latency measurements as fair, not excellent', () => {
    expect(classifyExperience({ ...base, latencyMs: 150 })).toBe('fair');
  });

  it('rates 10-25 Mbps as good', () => {
    expect(classifyExperience({ ...base, downMbps: 12 })).toBe('good');
  });

  it('rates slow throughput, high latency or heavy loss as poor', () => {
    expect(classifyExperience({ ...base, downMbps: 1 })).toBe('poor');
    expect(classifyExperience({ ...base, latencyMs: 400 })).toBe('poor');
    expect(classifyExperience({ ...base, packetLossPct: 20 })).toBe('poor');
  });

  it('reports no service when disconnected or every probe was lost', () => {
    expect(classifyExperience({ ...base, connected: false })).toBe('no_service');
    expect(classifyExperience({ ...base, packetLossPct: 100 })).toBe('no_service');
    expect(classifyExperience({ ...base, downMbps: null, latencyMs: null })).toBe('no_service');
  });

  it('never claims good/excellent without a throughput measurement', () => {
    expect(classifyExperience({ ...base, downMbps: null, latencyMs: 20 })).toBe('fair');
  });

  it('leaves samples with missing or poor GPS accuracy unrated', () => {
    expect(classifyExperience({ ...base, locationAccuracyM: null })).toBe('unrated');
    expect(classifyExperience({ ...base, locationAccuracyM: 500 })).toBe('unrated');
  });
});

describe('formatRfSignal', () => {
  const originalOS = Platform.OS;
  afterEach(() => {
    Platform.OS = originalOS;
  });

  it('shows a genuinely measured dBm value as-is', () => {
    expect(formatRfSignal(-97)).toBe('-97 dBm');
  });

  it('never invents a dBm value when none was measured', () => {
    Platform.OS = 'ios';
    expect(formatRfSignal(null)).toBe('Not available on iOS');
    Platform.OS = 'android';
    expect(formatRfSignal(undefined)).toBe('Not measured');
  });
});
