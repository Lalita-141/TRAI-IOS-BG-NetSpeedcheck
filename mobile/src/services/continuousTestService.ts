import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ContinuousTestConfig } from '../components/ContinuousTestSetupView';
import type {
  CycleResult,
  ContinuousTestSessionResults,
} from '../components/ContinuousTestProgressView';
import { GeoLocationResult, Sample } from '../types';
import { getConfig, getDeviceId } from '../config';
import { generateUUID } from '../utils/uuid';
import { sampleStore } from './sampleStore';
import { uploader } from './uploader';
import { speedTester } from './speedTester';
import { locationService } from './locationService';
import { measureVideoAndWeb, qualityForMbps } from './qosProbes';
import { testCoordinator, TestOwner } from './testCoordinator';
import { backgroundKeepAlive } from './backgroundKeepAlive';
import { promptForBackgroundLocation } from './locationPermission';

const STORAGE_KEY_SESSION = '@speedmonitor_continuous_session';

export type ContinuousPhase = 'idle' | 'waiting' | 'testing' | 'gap';

export interface ContinuousSessionState {
  active: boolean;
  config: ContinuousTestConfig | null; // kept after the session ends so it can be restarted
  startedAt: number | null;
  endsAt: number | null;
  finishedAt: number | null;
  currentCycle: number;
  phase: ContinuousPhase;
  gapEndsAt: number | null;
  livePrimary: string;
  liveSecondary: string;
  liveProgress: number;
  cycles: CycleResult[]; // newest first
  lastResults: ContinuousTestSessionResults | null;
  resultsSeen: boolean;
}

type SessionListener = (state: ContinuousSessionState) => void;

const KEEP_ALIVE_TAG = 'continuous';

const sleep = (ms: number) => new Promise(resolve => setTimeout(() => resolve(undefined), ms));

const OWNER_LABELS: Record<TestOwner, string> = {
  monitor: 'background monitor',
  manual: 'manual speed',
  continuous: 'continuous',
  scheduled: 'scheduled',
};

const INITIAL_STATE: ContinuousSessionState = {
  active: false,
  config: null,
  startedAt: null,
  endsAt: null,
  finishedAt: null,
  currentCycle: 0,
  phase: 'idle',
  gapEndsAt: null,
  livePrimary: '--',
  liveSecondary: '',
  liveProgress: 0,
  cycles: [],
  lastResults: null,
  resultsSeen: true,
};

const formatMbps = (v: number | null | undefined) => (v != null ? `${v.toFixed(1)} Mbps` : '--');

function mostCommon(values: (string | null | undefined)[]): string | null {
  const counts = new Map<string, number>();
  values.forEach(v => {
    if (v) counts.set(v, (counts.get(v) || 0) + 1);
  });
  let best: string | null = null;
  let bestCount = 0;
  counts.forEach((count, key) => {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  });
  return best;
}

function average(values: (number | null | undefined)[]): number | null {
  const nums = values.filter((v): v is number => typeof v === 'number' && !isNaN(v));
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

class ContinuousTestService {
  private state: ContinuousSessionState = { ...INITIAL_STATE };
  private listeners: Set<SessionListener> = new Set();
  private sessionId = 0;
  private watchId: number | null = null;
  private lastLocation: GeoLocationResult | null = null;

  getState(): ContinuousSessionState {
    return this.state;
  }

  subscribe(listener: SessionListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setState(patch: Partial<ContinuousSessionState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach(fn => {
      try {
        fn(this.state);
      } catch (e) {
        console.warn('Listener error in ContinuousTestService:', e);
      }
    });
  }

  private isCurrent(sessionId: number) {
    return this.state.active && this.sessionId === sessionId;
  }

  async start(config: ContinuousTestConfig): Promise<void> {
    if (this.state.active) {
      await this.stop();
    }

    const sessionId = ++this.sessionId;
    const now = Date.now();
    const totalPlannedSeconds = Math.max(10, config.durationMins * 60);

    this.setState({
      ...INITIAL_STATE,
      active: true,
      config,
      startedAt: now,
      endsAt: now + totalPlannedSeconds * 1000,
      phase: 'waiting',
      liveSecondary: 'Starting continuous session...',
    });

    locationService.requestPermission().catch(() => {});
    promptForBackgroundLocation().catch(() => {});
    this.acquireKeepAlive();
    this.persist();

    this.loop(sessionId);
  }

  /**
   * Picks up a session interrupted by the app being killed. Runs on every launch,
   * including when iOS relaunches the app in the background.
   */
  async restore(): Promise<void> {
    if (this.state.active) return;
    let saved: Partial<ContinuousSessionState> | null = null;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY_SESSION);
      saved = raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn('Failed to load continuous session', e);
    }
    if (this.state.active || !saved?.config || !saved.endsAt) return;

    const sessionId = ++this.sessionId;
    this.setState({
      ...INITIAL_STATE,
      ...saved,
      active: true,
      phase: 'waiting',
      liveSecondary: 'Resuming continuous session...',
    });

    if (Date.now() >= saved.endsAt) {
      await this.finish(false);
      return;
    }
    this.acquireKeepAlive();
    this.loop(sessionId);
  }

  private persist() {
    const { config, startedAt, endsAt, currentCycle, cycles } = this.state;
    AsyncStorage.setItem(
      STORAGE_KEY_SESSION,
      JSON.stringify({ config, startedAt, endsAt, currentCycle, cycles })
    ).catch(e => console.warn('Failed to save continuous session', e));
  }

  /** Stops the running session (user action). Returns the session results. */
  async stop(): Promise<ContinuousTestSessionResults | null> {
    if (!this.state.active) {
      return this.state.lastResults;
    }
    return this.finish(true);
  }

  markResultsSeen() {
    if (!this.state.resultsSeen) {
      this.setState({ resultsSeen: true });
    }
  }

  private async loop(sessionId: number) {
    try {
      while (this.isCurrent(sessionId) && Date.now() < (this.state.endsAt ?? 0)) {
        const config = this.state.config!;
        const cycleNumber = this.state.currentCycle + 1;
        const busyOwner = testCoordinator.getActiveOwner();

        this.setState({
          currentCycle: cycleNumber,
          phase: testCoordinator.isBusy() ? 'waiting' : 'testing',
          gapEndsAt: null,
          liveProgress: 0,
          livePrimary: '--',
          liveSecondary: busyOwner
            ? `Waiting for ${OWNER_LABELS[busyOwner]} test to finish...`
            : 'Starting cycle...',
        });

        // Exclusive network slot: queued behind monitor / scheduled tests if needed
        const outcome = await testCoordinator.run('continuous', async () => {
          if (!this.isCurrent(sessionId)) return null;
          this.setState({ phase: 'testing' });
          return this.runCycle(cycleNumber, config);
        });

        if (!this.isCurrent(sessionId)) return;

        if (outcome) {
          this.setState({ cycles: [outcome.cycle, ...this.state.cycles] });
          this.persist();
          if (outcome.sample) {
            // Don't block the loop on storage / network
            sampleStore
              .add(outcome.sample)
              .then(() => uploader.flush())
              .catch(e => console.warn('Continuous sample save failed:', e));
          }
        }

        const endsAt = this.state.endsAt ?? 0;
        if (Date.now() >= endsAt) break;

        const gapEndsAt = Math.min(Date.now() + Math.max(3, config.gapSeconds) * 1000, endsAt);
        this.setState({
          phase: 'gap',
          gapEndsAt,
          liveProgress: 0,
          liveSecondary: `Cooling interval before Cycle #${cycleNumber + 1}`,
        });

        // Timestamp based wait: correct even if JS was suspended in between
        while (this.isCurrent(sessionId) && Date.now() < gapEndsAt) {
          await sleep(Math.min(500, Math.max(gapEndsAt - Date.now(), 0)));
        }
      }

      if (this.isCurrent(sessionId)) {
        await this.finish(false);
      }
    } catch (err) {
      console.warn('Continuous session loop error:', err);
      if (this.isCurrent(sessionId)) {
        await this.finish(false);
      }
    }
  }

  private async getLocation(): Promise<GeoLocationResult> {
    if (this.lastLocation) return this.lastLocation;
    const loc = await locationService.getCurrentLocation();
    this.lastLocation = loc;
    return loc;
  }

  private buildBaseSample(deviceId: string, loc: GeoLocationResult, testLabel: string | null): Sample {
    return {
      id: generateUUID(),
      device_id: deviceId,
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
      location_type: testLabel,
      lat: loc.lat,
      lng: loc.lng,
      accuracy: loc.accuracy,
      test_type: 'continuous',
    };
  }

  /** Runs one real measurement cycle. Never throws: failures become failed cycles. */
  private async runCycle(
    cycleNumber: number,
    config: ContinuousTestConfig
  ): Promise<{ cycle: CycleResult; sample: Sample | null }> {
    const timestamp = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    try {
      const appConfig = await getConfig();
      const deviceId = await getDeviceId();
      const loc = await this.getLocation();
      const base = this.buildBaseSample(deviceId, loc, appConfig.testLabel ?? null);

      if (config.testType === 'speed') {
        const result = await speedTester.runFullTest(appConfig, progress => {
          this.setState({
            liveProgress: progress.progressPercent,
            liveSecondary: progress.message,
            livePrimary:
              progress.downSpeed != null
                ? formatMbps(progress.downSpeed)
                : progress.latency != null
                ? `${progress.latency} ms`
                : '--',
          });
        });
        testCoordinator.markFullTestCompleted('continuous');

        const sample: Sample = {
          ...base,
          down_mbps: result.downMbps,
          up_mbps: result.upMbps,
          latency_ms: result.latency,
          jitter_ms: result.jitter,
          packet_loss_pct: result.packetLoss,
          network: result.networkType,
          radio: result.radioTech,
          carrier: result.carrier,
          ...result.signal,
        };
        return {
          sample,
          cycle: {
            cycleNumber,
            timestamp,
            primaryMetric: formatMbps(result.downMbps),
            primaryLabel: 'Download',
            secondaryMetric: formatMbps(result.upMbps),
            secondaryLabel: 'Upload',
            extraInfo: `Ping: ${result.latency ?? '--'} ms • ${result.carrier ?? ''} ${result.radioTech ?? ''}`.trim(),
            numericVal: result.downMbps ?? 0,
            failed: result.downMbps == null,
            details: {
              upMbps: result.upMbps,
              latencyMs: result.latency,
              carrier: result.carrier,
              radio: result.radioTech,
            },
          },
        };
      }

      if (config.testType === 'coverage') {
        this.setState({ liveProgress: 20, liveSecondary: 'Reading network, carrier & radio...' });
        const net = await speedTester.getNetworkContext();

        this.setState({ liveProgress: 55, liveSecondary: 'Probing reachability & latency...' });
        const ping = net.isConnected
          ? await speedTester.measureLatencyAndJitter(appConfig.serverUrl)
          : { latency: null, jitter: null, packetLoss: 100 };
        const connected = net.isConnected && ping.packetLoss < 100;
        this.setState({
          liveProgress: 100,
          livePrimary: connected ? net.radio || net.network : 'No Service',
          liveSecondary: ping.latency != null ? `${ping.latency} ms latency` : 'Unreachable',
        });

        const sample: Sample = {
          ...base,
          latency_ms: ping.latency,
          jitter_ms: ping.jitter,
          packet_loss_pct: ping.packetLoss,
          network: net.network,
          radio: net.radio,
          carrier: net.carrier,
          ...net.signal,
        };
        const gps = loc.accuracy != null ? ` • GPS ±${Math.round(loc.accuracy)}m` : '';
        return {
          sample,
          cycle: {
            cycleNumber,
            timestamp,
            primaryMetric: connected ? net.radio || net.network : 'No Service',
            primaryLabel: 'Network',
            secondaryMetric: ping.latency != null ? `${ping.latency} ms` : '--',
            secondaryLabel: 'Latency',
            extraInfo: `${net.carrier ?? 'Unknown'} • Loss ${ping.packetLoss}%${gps}`,
            numericVal: ping.latency ?? 0,
            failed: !connected,
            details: {
              latencyMs: ping.latency,
              carrier: net.carrier,
              radio: connected ? net.radio : null,
            },
          },
        };
      }

      // video_browser
      this.setState({ liveProgress: 15, liveSecondary: 'Checking connection...' });
      const net = await speedTester.getNetworkContext();
      if (!net.isConnected || net.network === 'none') {
        throw new Error('No internet connection');
      }
      if (appConfig.wifiOnly && net.network !== 'wifi') {
        throw new Error('Wi-Fi only mode enabled');
      }

      this.setState({ liveProgress: 40, liveSecondary: 'Streaming video & loading web page...' });
      const probe = await measureVideoAndWeb(appConfig.serverUrl);
      this.setState({
        liveProgress: 100,
        livePrimary: probe.pageLoadSec != null ? `${probe.pageLoadSec}s` : '--',
        liveSecondary: probe.streamingQuality ?? '',
      });

      const sample: Sample = {
        ...base,
        down_mbps: probe.videoMbps,
        latency_ms: probe.ttfbMs,
        network: net.network,
        radio: net.radio,
        carrier: net.carrier,
        ...net.signal,
        video_delay_ms: probe.videoDelayMs,
        web_delay_ms: probe.pageLoadSec != null ? Math.round(probe.pageLoadSec * 1000) : null,
        page_load_sec: probe.pageLoadSec,
        ttfb_ms: probe.ttfbMs,
        streaming_quality: probe.streamingQuality,
      };
      const failed = probe.pageLoadSec == null && probe.videoDelayMs == null;
      return {
        sample: failed ? null : sample,
        cycle: {
          cycleNumber,
          timestamp,
          primaryMetric: probe.pageLoadSec != null ? `${probe.pageLoadSec}s` : '--',
          primaryLabel: 'Load Time',
          secondaryMetric: probe.streamingQuality ?? '--',
          secondaryLabel: 'Stream',
          extraInfo: `Video start: ${probe.videoDelayMs ?? '--'} ms • TTFB ${probe.ttfbMs ?? '--'} ms`,
          numericVal: probe.pageLoadSec ?? 0,
          failed,
          details: {
            videoDelayMs: probe.videoDelayMs,
            videoMbps: probe.videoMbps,
            carrier: net.carrier,
            radio: net.radio,
          },
        },
      };
    } catch (err: any) {
      const message = err?.message || 'Test failed';
      return {
        sample: null,
        cycle: {
          cycleNumber,
          timestamp,
          primaryMetric: 'Failed',
          primaryLabel: 'Result',
          secondaryMetric: '--',
          secondaryLabel: '',
          extraInfo: message,
          numericVal: 0,
          failed: true,
        },
      };
    }
  }

  private buildResults(stoppedByUser: boolean): ContinuousTestSessionResults {
    const config = this.state.config!;
    const cycles = this.state.cycles;
    const ok = cycles.filter(c => !c.failed);
    const startedAt = this.state.startedAt ?? Date.now();
    const plannedSeconds = Math.max(10, config.durationMins * 60);
    const totalSecondsElapsed = Math.min(
      plannedSeconds,
      Math.max(0, Math.round((Date.now() - startedAt) / 1000))
    );

    let summary: ContinuousTestSessionResults['summary'];

    if (config.testType === 'speed') {
      const avgDown = average(ok.map(c => c.numericVal));
      const avgUp = average(ok.map(c => c.details?.upMbps));
      const avgLat = average(ok.map(c => c.details?.latencyMs));
      summary = {
        stat1Label: 'Avg Download',
        stat1Value: formatMbps(avgDown),
        stat2Label: 'Peak Download',
        stat2Value: ok.length ? formatMbps(Math.max(...ok.map(c => c.numericVal))) : '--',
        stat3Label: 'Avg Upload',
        stat3Value: formatMbps(avgUp),
        stat4Label: 'Avg Latency',
        stat4Value: avgLat != null ? `${Math.round(avgLat)} ms` : '--',
      };
    } else if (config.testType === 'coverage') {
      const avgLat = average(ok.map(c => c.details?.latencyMs));
      summary = {
        stat1Label: 'Avg Latency',
        stat1Value: avgLat != null ? `${Math.round(avgLat)} ms` : '--',
        stat2Label: 'Connectivity',
        stat2Value: cycles.length ? `${Math.round((ok.length / cycles.length) * 100)}%` : '--',
        stat3Label: 'Active Carrier',
        stat3Value: mostCommon(cycles.map(c => c.details?.carrier)) ?? '--',
        stat4Label: 'Network Type',
        stat4Value: mostCommon(ok.map(c => c.details?.radio)) ?? '--',
      };
    } else {
      const avgLoad = average(ok.map(c => c.numericVal));
      const avgVideoMbps = average(ok.map(c => c.details?.videoMbps));
      const avgVideoDelay = average(ok.map(c => c.details?.videoDelayMs));
      summary = {
        stat1Label: 'Avg Load Time',
        stat1Value: avgLoad != null ? `${avgLoad.toFixed(2)}s` : '--',
        stat2Label: 'Stream Quality',
        stat2Value: avgVideoMbps != null ? qualityForMbps(avgVideoMbps) : '--',
        stat3Label: 'Avg Video Start',
        stat3Value: avgVideoDelay != null ? `${Math.round(avgVideoDelay)} ms` : '--',
        stat4Label: 'Video Throughput',
        stat4Value: formatMbps(avgVideoMbps),
      };
    }

    return {
      testType: config.testType,
      durationMinsPlanned: config.durationMins,
      totalSecondsElapsed,
      totalCyclesCompleted: cycles.length,
      stoppedByUser,
      cycles,
      summary,
    };
  }

  private async finish(stoppedByUser: boolean): Promise<ContinuousTestSessionResults> {
    const results = this.buildResults(stoppedByUser);
    this.setState({
      active: false,
      phase: 'idle',
      gapEndsAt: null,
      finishedAt: Date.now(),
      lastResults: results,
      resultsSeen: false,
    });
    AsyncStorage.removeItem(STORAGE_KEY_SESSION).catch(() => {});
    this.releaseKeepAlive();
    return results;
  }

  // --- Background keep-alive (screen off / app in background) ---

  private acquireKeepAlive() {
    backgroundKeepAlive.acquire(KEEP_ALIVE_TAG, { relaunchAfterKill: true });

    // Location watch feeds each cycle's coordinates
    if (this.watchId === null) {
      this.watchId = locationService.watchPosition(loc => {
        this.lastLocation = loc;
      });
    }
  }

  private releaseKeepAlive() {
    backgroundKeepAlive.release(KEEP_ALIVE_TAG);
    if (this.watchId !== null) {
      locationService.clearWatch(this.watchId);
      this.watchId = null;
    }
    this.lastLocation = null;
  }
}

export const continuousTestService = new ContinuousTestService();

/** React hook: live continuous session state, survives tab switches. */
export function useContinuousSession(): ContinuousSessionState {
  const [state, setState] = useState<ContinuousSessionState>(continuousTestService.getState());
  useEffect(() => continuousTestService.subscribe(setState), []);
  return state;
}
