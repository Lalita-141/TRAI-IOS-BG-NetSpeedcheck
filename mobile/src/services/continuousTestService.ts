import { useEffect, useState } from 'react';
import { NativeModules, Platform } from 'react-native';
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
import {
  COVERAGE_DOWNLOAD_MB,
  coverageSampleFields,
  isFreshLocation,
  measureCoverage,
} from './coverageSurvey';
import { EXPERIENCE_LABELS } from '../config/coverageThresholds';
import { testCoordinator, TestOwner } from './testCoordinator';
import { monitorService } from './monitorService';

export type ContinuousPhase = 'idle' | 'waiting' | 'testing' | 'gap' | 'paused';

// Default survey data budget; past it coverage cycles measure latency only.
export const DEFAULT_COVERAGE_DATA_CAP_MB = 50;

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
  paused: boolean;
  pausedAt: number | null;
  dataUsedMB: number; // throughput test payloads transferred this session
  surveyId: string | null; // session_id stamped on every sample of this session
}

type SessionListener = (state: ContinuousSessionState) => void;

// Safely resolve BackgroundService if native module is available (Android keep-alive)
let BackgroundService: any = null;
try {
  if (NativeModules && NativeModules.RNBackgroundActions) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    BackgroundService = require('react-native-background-actions').default;
  }
} catch (err) {
  console.log('Background actions not loaded for continuous test', err);
}

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
  paused: false,
  pausedAt: null,
  dataUsedMB: 0,
  surveyId: null,
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
  private monitorUnsubscribe: (() => void) | null = null;
  private androidServiceStarting = false;

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
      surveyId: generateUUID(),
    });

    locationService.requestPermission().catch(() => {});
    await this.acquireKeepAlive();

    this.loop(sessionId);
  }

  /** Stops the running session (user action). Returns the session results. */
  async stop(): Promise<ContinuousTestSessionResults | null> {
    if (!this.state.active) {
      return this.state.lastResults;
    }
    return this.finish(true);
  }

  /** Pauses between cycles; a running cycle finishes first. Paused time is not counted. */
  pause() {
    if (!this.state.active || this.state.paused) return;
    this.setState({ paused: true, pausedAt: Date.now() });
  }

  resume() {
    if (!this.state.active || !this.state.paused) return;
    const pausedMs = Date.now() - (this.state.pausedAt ?? Date.now());
    this.setState({
      paused: false,
      pausedAt: null,
      endsAt: (this.state.endsAt ?? Date.now()) + pausedMs,
      gapEndsAt: this.state.gapEndsAt != null ? this.state.gapEndsAt + pausedMs : null,
    });
  }

  private async waitWhilePaused(sessionId: number) {
    if (!this.state.paused) return;
    const resumePhase = this.state.phase;
    this.setState({ phase: 'paused', liveSecondary: 'Paused' });
    while (this.isCurrent(sessionId) && this.state.paused) {
      await sleep(500);
    }
    if (this.isCurrent(sessionId)) this.setState({ phase: resumePhase });
  }

  markResultsSeen() {
    if (!this.state.resultsSeen) {
      this.setState({ resultsSeen: true });
    }
  }

  private async loop(sessionId: number) {
    try {
      while (this.isCurrent(sessionId) && Date.now() < (this.state.endsAt ?? 0)) {
        await this.waitWhilePaused(sessionId);
        if (!this.isCurrent(sessionId)) return;
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

        this.setState({
          phase: 'gap',
          gapEndsAt: Math.min(Date.now() + Math.max(3, config.gapSeconds) * 1000, endsAt),
          liveProgress: 0,
          liveSecondary: `Cooling interval before Cycle #${cycleNumber + 1}`,
        });

        // Timestamp based wait: correct even if JS was suspended in between.
        // gapEndsAt is re-read because resume() shifts it by the paused time.
        while (this.isCurrent(sessionId) && Date.now() < (this.state.gapEndsAt ?? 0)) {
          if (this.state.paused) {
            await this.waitWhilePaused(sessionId);
            continue;
          }
          await sleep(Math.min(500, Math.max((this.state.gapEndsAt ?? 0) - Date.now(), 0)));
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

  /** Reuses the watched fix only while it is fresh; otherwise requests a new one. */
  private async getLocation(): Promise<GeoLocationResult> {
    if (isFreshLocation(this.lastLocation)) return this.lastLocation;
    const loc = await locationService.getCurrentLocation();
    if (loc.lat != null) this.lastLocation = loc;
    return loc;
  }

  private buildBaseSample(deviceId: string, loc: GeoLocationResult): Sample {
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
      location_type: loc.accuracy && loc.accuracy < 25 ? 'Outdoor' : 'Indoor',
      lat: loc.lat,
      lng: loc.lng,
      accuracy: loc.accuracy,
      location_ts: loc.timestamp != null ? loc.timestamp / 1000 : null,
      speed_mps: loc.speed ?? null,
      test_type: 'continuous',
      session_id: this.state.surveyId,
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
      const base = this.buildBaseSample(deviceId, loc);

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
        const capMB = config.dataCapMB ?? DEFAULT_COVERAGE_DATA_CAP_MB;
        const allowThroughput = this.state.dataUsedMB + COVERAGE_DOWNLOAD_MB <= capMB;
        const m = await measureCoverage({
          serverUrl: appConfig.serverUrl,
          allowThroughput,
          getLocation: () => this.getLocation(),
          onProgress: p => {
            if (p.stage === 'network') {
              this.setState({ liveProgress: 15, liveSecondary: 'Reading network state...' });
            } else if (p.stage === 'latency') {
              this.setState({ liveProgress: 40, liveSecondary: 'Measuring latency...' });
            } else if (p.stage === 'throughput') {
              this.setState({ liveProgress: 70, liveSecondary: 'Measuring throughput...' });
            } else {
              this.setState({ liveProgress: 90, liveSecondary: 'Resolving GPS fix...' });
            }
          },
        });
        const dataUsedMB = this.state.dataUsedMB + m.bytesUsed / (1024 * 1024);
        const label = EXPERIENCE_LABELS[m.experience];
        let liveSecondary = m.latencyMs != null ? `${m.latencyMs} ms latency` : 'Unreachable';
        if (!allowThroughput) liveSecondary = `Data cap (${capMB} MB) reached: latency only`;
        this.setState({ dataUsedMB, liveProgress: 100, livePrimary: label, liveSecondary });

        // Every cycle is stored, including failures, so dead zones stay on the map
        const sample: Sample = { ...base, ...coverageSampleFields(m) };
        const gps = m.location.accuracy != null ? ` • GPS ±${Math.round(m.location.accuracy)}m` : '';
        const failure = m.failureReason ? ` • ${m.failureReason}` : '';
        let secondaryMetric = '--';
        if (m.downMbps != null) secondaryMetric = formatMbps(m.downMbps);
        else if (m.latencyMs != null) secondaryMetric = `${m.latencyMs} ms`;
        return {
          sample,
          cycle: {
            cycleNumber,
            timestamp,
            primaryMetric: label,
            primaryLabel: 'Experience',
            secondaryMetric,
            secondaryLabel: m.downMbps != null ? 'Download' : 'Latency',
            extraInfo: `${m.carrier ?? 'Unknown'} • ${m.radio ?? m.network}${gps}${failure}`,
            numericVal: m.latencyMs ?? 0,
            failed: !m.connected,
            details: {
              latencyMs: m.latencyMs,
              downMbps: m.downMbps,
              experience: m.experience,
              carrier: m.carrier,
              radio: m.connected ? m.radio : null,
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
    // endsAt was extended by any paused time, so subtract that back out
    const pausedMs = Math.max(0, (this.state.endsAt ?? 0) - startedAt - plannedSeconds * 1000);
    const totalSecondsElapsed = Math.min(
      plannedSeconds,
      Math.max(0, Math.round((Date.now() - startedAt - pausedMs) / 1000))
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
      const avgDown = average(ok.map(c => c.details?.downMbps));
      summary = {
        stat1Label: 'Avg Download',
        stat1Value: formatMbps(avgDown),
        stat2Label: 'Avg Latency',
        stat2Value: avgLat != null ? `${Math.round(avgLat)} ms` : '--',
        stat3Label: 'Connectivity',
        stat3Value: cycles.length ? `${Math.round((ok.length / cycles.length) * 100)}%` : '--',
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
    await this.releaseKeepAlive();
    return results;
  }

  // --- Background keep-alive (screen off / app in background) ---

  private async acquireKeepAlive() {
    // iOS: dedicated low-power native location session keeps the JS runtime alive
    const bridge = NativeModules.NativeMonitorBridge;
    if (Platform.OS === 'ios' && bridge && typeof bridge.acquireKeepAlive === 'function') {
      bridge.acquireKeepAlive(KEEP_ALIVE_TAG).catch(() => {});
    }

    // Location watch feeds each cycle's coordinates (and keeps Android awake with the service)
    if (this.watchId === null) {
      // Coverage surveys need precise, frequent fixes while walking/driving
      const survey = this.state.config?.testType === 'coverage';
      this.watchId = locationService.watchPosition(
        loc => {
          this.lastLocation = loc;
        },
        survey ? { enableHighAccuracy: true, distanceFilter: 10, interval: 5000 } : undefined
      );
    }

    // Android: foreground service. Monitor stopping also stops the shared service,
    // so re-acquire it whenever monitoring turns off mid-session.
    await this.ensureAndroidService();
    if (!this.monitorUnsubscribe) {
      this.monitorUnsubscribe = monitorService.subscribe(status => {
        if (!status.isRunning && this.state.active) {
          this.ensureAndroidService();
        }
      });
    }
  }

  private async ensureAndroidService() {
    if (Platform.OS !== 'android' || !BackgroundService || this.androidServiceStarting) return;
    if (BackgroundService.isRunning()) return; // already keeping JS alive (monitor or us)

    this.androidServiceStarting = true;
    try {
      const keepAliveRunner = async () => {
        // Stay alive while a continuous session or monitoring needs the service.
        // Returning lets the library stop the service.
        while (
          BackgroundService.isRunning() &&
          (this.state.active || monitorService.getIsRunning())
        ) {
          await sleep(5000);
        }
      };
      await BackgroundService.start(keepAliveRunner, {
        taskName: 'NetSpeedContinuous',
        taskTitle: 'Continuous Test Running',
        taskDesc: 'Measuring network quality in the background',
        taskIcon: {
          name: 'ic_launcher',
          type: 'mipmap',
        },
        color: '#06B6D4',
        linkingURI: 'speedmonitor://',
      });
    } catch (e) {
      console.warn('Continuous BackgroundService.start error:', e);
    } finally {
      this.androidServiceStarting = false;
    }
  }

  private async releaseKeepAlive() {
    const bridge = NativeModules.NativeMonitorBridge;
    if (Platform.OS === 'ios' && bridge && typeof bridge.releaseKeepAlive === 'function') {
      bridge.releaseKeepAlive(KEEP_ALIVE_TAG).catch(() => {});
    }
    if (this.watchId !== null) {
      locationService.clearWatch(this.watchId);
      this.watchId = null;
    }
    this.lastLocation = null;
    if (this.monitorUnsubscribe) {
      this.monitorUnsubscribe();
      this.monitorUnsubscribe = null;
    }
    // Android service runner exits by itself once neither feature needs it
  }
}

export const continuousTestService = new ContinuousTestService();

/** React hook: live continuous session state, survives tab switches. */
export function useContinuousSession(): ContinuousSessionState {
  const [state, setState] = useState<ContinuousSessionState>(continuousTestService.getState());
  useEffect(() => continuousTestService.subscribe(setState), []);
  return state;
}
