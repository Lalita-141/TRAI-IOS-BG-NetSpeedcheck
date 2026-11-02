import { Platform, NativeModules, AppState, AppStateStatus } from 'react-native';
import { Sample, SpeedTestProgress, GeoLocationResult } from '../types';
import { getConfig, getDeviceId } from '../config';
import { generateUUID } from '../utils/uuid';
import { sampleStore } from './sampleStore';
import { speedTester } from './speedTester';
import { uploader } from './uploader';
import { locationService } from './locationService';
import { testCoordinator, TestOwner } from './testCoordinator';
import { backgroundKeepAlive } from './backgroundKeepAlive';
import { promptForBackgroundLocation } from './locationPermission';

const MONITOR_KEEP_ALIVE_TAG = 'monitor';
// Held for one test, so a manual test keeps running if the screen turns off
const TEST_KEEP_ALIVE_TAG = 'speed-test';

export interface MonitorStatus {
  isRunning: boolean;
  isTesting: boolean;
  lastTestTime: number | null;
  lastSample: Sample | null;
  pendingCount: number;
  currentProgress?: SpeedTestProgress;
  error?: string | null;
}

export type StatusListener = (status: MonitorStatus) => void;

class MonitorService {
  private isRunning = false;
  private isTesting = false;
  private lastTestTime: number | null = null;
  private lastSample: Sample | null = null;
  private watchId: number | null = null;
  private intervalTimerId: any = null;
  private listeners: Set<StatusListener> = new Set();
  private lastKnownLocation: GeoLocationResult | null = null;
  private appStateSubscription: any = null;

  constructor() {
    this.handleAppStateChange = this.handleAppStateChange.bind(this);
    this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);
  }

  private handleAppStateChange(nextAppState: AppStateStatus) {
    if (nextAppState === 'active' && this.isRunning) {
      // Recheck when returning to foreground
      this.checkAndRunIntervalTest();
    }
  }

  subscribe(listener: StatusListener): () => void {
    this.listeners.add(listener);
    this.notify();
    return () => {
      this.listeners.delete(listener);
    };
  }

  private async notify(progress?: SpeedTestProgress, error?: string | null) {
    const pendingCount = await sampleStore.getPendingCount();
    const status: MonitorStatus = {
      isRunning: this.isRunning,
      isTesting: this.isTesting,
      lastTestTime: this.lastTestTime,
      lastSample: this.lastSample,
      pendingCount,
      currentProgress: progress,
      error,
    };
    this.listeners.forEach(fn => {
      try {
        fn(status);
      } catch (e) {
        console.warn('Listener error in MonitorService:', e);
      }
    });
  }

  async start(): Promise<boolean> {
    if (this.isRunning) return true;

    this.isRunning = true;
    this.notify();

    // 1. Request location authorization
    locationService.requestPermission().catch(() => {});
    promptForBackgroundLocation().catch(() => {});

    // 2. Start background location watch (keeps iOS and Android app alive in background)
    this.watchId = locationService.watchPosition(loc => {
      this.lastKnownLocation = loc;
      this.checkAndRunIntervalTest(loc);
    });

    const config = await getConfig();
    const intervalSeconds = Math.max(config.testIntervalSeconds, 10);

    // 3. Fallback active interval loop
    if (this.intervalTimerId) {
      clearInterval(this.intervalTimerId);
    }
    this.intervalTimerId = setInterval(() => {
      if (this.isRunning) {
        this.checkAndRunIntervalTest();
      }
    }, 5000); // Check every 5s if interval passed

    // 4. Start Native iOS background daemon if available (for killed state relaunch & native background execution)
    if (Platform.OS === 'ios' && NativeModules.NativeMonitorBridge) {
      try {
        const deviceId = await getDeviceId();
        if (typeof NativeModules.NativeMonitorBridge.startWithConfig === 'function') {
          NativeModules.NativeMonitorBridge.startWithConfig(config.serverUrl, intervalSeconds, deviceId);
        } else {
          NativeModules.NativeMonitorBridge.start(config.serverUrl, intervalSeconds);
        }
      } catch (e) {
        console.warn('NativeMonitorBridge.start error:', e);
      }
    }

    // 5. Keep JS running with the screen off, so the interval loop above keeps firing
    backgroundKeepAlive.acquire(MONITOR_KEEP_ALIVE_TAG);

    return true;
  }

  async stop() {
    this.isRunning = false;

    if (this.watchId !== null) {
      locationService.clearWatch(this.watchId);
      this.watchId = null;
    }

    if (this.intervalTimerId) {
      clearInterval(this.intervalTimerId);
      this.intervalTimerId = null;
    }

    if (Platform.OS === 'ios' && NativeModules.NativeMonitorBridge) {
      try {
        NativeModules.NativeMonitorBridge.stop();
      } catch (e) {
        console.warn('NativeMonitorBridge.stop error:', e);
      }
    }

    backgroundKeepAlive.release(MONITOR_KEEP_ALIVE_TAG);

    this.notify();
  }

  private async checkAndRunIntervalTest(loc?: GeoLocationResult) {
    if (!this.isRunning || this.isTesting) return;

    // Another feature (continuous / scheduled) is testing right now: skip this
    // tick, the 5s interval loop retries once the shared test slot is free.
    if (testCoordinator.isBusy()) return;

    const config = await getConfig();
    const now = Date.now();
    // A full speed test run by any feature counts towards the monitor interval,
    // so a continuous speed session doesn't get duplicated by monitor tests.
    const lastShared = testCoordinator.getLastFullTest().at;
    const reference = Math.max(this.lastTestTime ?? 0, lastShared);
    const elapsedSeconds = reference ? (now - reference) / 1000 : Infinity;

    if (elapsedSeconds >= config.testIntervalSeconds) {
      await this.runTest(loc, 'monitor');
    }
  }

  async testNow(): Promise<Sample | null> {
    return await this.runTest(undefined, 'manual');
  }

  private async runTest(location?: GeoLocationResult, owner: TestOwner = 'manual'): Promise<Sample | null> {
    if (this.isTesting) {
      console.log('Speed test already in progress, skipping...');
      return null;
    }

    this.isTesting = true;
    backgroundKeepAlive.acquire(TEST_KEEP_ALIVE_TAG);
    this.notify({
      phase: 'idle',
      message: testCoordinator.isBusy()
        ? 'Waiting for the running test to finish...'
        : 'Preparing speed test...',
      progressPercent: 5,
    });

    try {
      const config = await getConfig();
      const deviceId = await getDeviceId();

      // Acquire location if not passed
      let loc = location || this.lastKnownLocation;
      if (!loc) {
        loc = await locationService.getCurrentLocation();
        this.lastKnownLocation = loc;
      }

      // Execute Speed Test (exclusive: waits if continuous/scheduled is testing)
      const result = await testCoordinator.run(owner, () =>
        speedTester.runFullTest(config, progress => {
          this.notify(progress);
        })
      );
      testCoordinator.markFullTestCompleted(owner);

      // Construct Sample with QoS parameters
      const sample: Sample = {
        id: generateUUID(),
        device_id: deviceId,
        ts: Math.floor(Date.now() / 1000),
        down_mbps: result.downMbps,
        up_mbps: result.upMbps,
        latency_ms: result.latency,
        jitter_ms: result.jitter,
        packet_loss_pct: result.packetLoss,
        network: result.networkType,
        radio: result.radioTech,
        carrier: result.carrier,
        ...result.signal,
        device_model: Platform.OS === 'ios' ? 'Apple iPhone' : 'Android Device',
        os_platform: `${Platform.OS} ${Platform.Version}`,
        location_type: config.testLabel ?? null,
        lat: loc.lat,
        lng: loc.lng,
        accuracy: loc.accuracy,
        test_type: 'speed',
      };

      // Save to queue
      await sampleStore.add(sample);
      this.lastSample = sample;
      this.lastTestTime = Date.now();

      // Auto-flush pending queue to server
      await uploader.flush();

      this.isTesting = false;
      this.notify(
        {
          phase: 'complete',
          message: 'Test finished and queued/uploaded',
          progressPercent: 100,
          latency: sample.latency_ms ?? undefined,
          downSpeed: sample.down_mbps ?? undefined,
          upSpeed: sample.up_mbps ?? undefined,
        },
        null
      );

      return sample;
    } catch (err: any) {
      console.warn('Speed test failed:', err);
      this.isTesting = false;
      this.notify(
        {
          phase: 'error',
          message: err?.message || 'Speed test failed',
          progressPercent: 0,
        },
        err?.message || 'Speed test encountered an error'
      );
      return null;
    } finally {
      backgroundKeepAlive.release(TEST_KEEP_ALIVE_TAG);
    }
  }

  getIsRunning(): boolean {
    return this.isRunning;
  }

  getLastSample(): Sample | null {
    return this.lastSample;
  }
}

export const monitorService = new MonitorService();
export const monitorServices = monitorService;
export default monitorService;
