import { Platform, NativeModules, AppState, AppStateStatus } from 'react-native';
import { Sample, SpeedTestProgress, GeoLocationResult } from '../types';
import { getConfig, getDeviceId } from '../config';
import { generateUUID } from '../utils/uuid';
import { sampleStore } from './sampleStore';
import { speedTester } from './speedTester';
import { uploader } from './uploader';
import { locationService } from './locationService';

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

// Safely resolve BackgroundService if native module is available
let BackgroundService: any = null;
try {
  if (NativeModules && NativeModules.RNBackgroundActions) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    BackgroundService = require('react-native-background-actions').default;
  }
} catch (err) {
  console.log('Background actions not loaded, using Location keep-alive', err);
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(() => resolve(undefined), ms));

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

    // 4. Start Native iOS background daemon if available (for killed state relaunch \u0026 native background execution)
    if (Platform.OS === 'ios' && NativeModules.NativeMonitorBridge) {
      try {
        NativeModules.NativeMonitorBridge.start(config.serverUrl, intervalSeconds);
      } catch (e) {
        console.warn('NativeMonitorBridge.start error:', e);
      }
    }

    // 5. If BackgroundService is linked & supported, start persistent background runner
    if (BackgroundService && typeof BackgroundService.isRunning === 'function') {
      try {
        const backgroundRunner = async (taskData?: { delay: number }) => {
          const delayMs = taskData?.delay || 10000;
          while (BackgroundService.isRunning() && this.isRunning) {
            try {
              await this.checkAndRunIntervalTest();
            } catch (e) {
              console.warn('Background runner test error:', e);
            }
            await sleep(delayMs);
          }
        };

        const bgOptions = {
          taskName: 'TRAISpeedMonitor',
          taskTitle: 'TRAI Speed Monitor Active',
          taskDesc: `Logging QoS & coverage every ${intervalSeconds}s in background`,
          taskIcon: {
            name: 'ic_launcher',
            type: 'mipmap',
          },
          color: '#06B6D4',
          linkingURI: 'speedmonitor://',
          parameters: {
            delay: intervalSeconds * 1000,
          },
        };

        if (!BackgroundService.isRunning()) {
          await BackgroundService.start(backgroundRunner, bgOptions);
        }
      } catch (bgErr) {
        console.warn('BackgroundService.start error:', bgErr);
      }
    }

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

    if (BackgroundService && typeof BackgroundService.isRunning === 'function') {
      try {
        if (BackgroundService.isRunning()) {
          await BackgroundService.stop();
        }
      } catch (e) {
        console.warn('BackgroundService.stop error:', e);
      }
    }

    this.notify();
  }

  private async checkAndRunIntervalTest(loc?: GeoLocationResult) {
    if (!this.isRunning || this.isTesting) return;

    const config = await getConfig();
    const now = Date.now();
    const elapsedSeconds = this.lastTestTime ? (now - this.lastTestTime) / 1000 : Infinity;

    if (elapsedSeconds >= config.testIntervalSeconds) {
      await this.runTest(loc);
    }
  }

  async testNow(): Promise<Sample | null> {
    return await this.runTest();
  }

  private async runTest(location?: GeoLocationResult): Promise<Sample | null> {
    if (this.isTesting) {
      console.log('Speed test already in progress, skipping...');
      return null;
    }

    this.isTesting = true;
    this.notify({
      phase: 'idle',
      message: 'Preparing speed test...',
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

      // Execute Speed Test
      const result = await speedTester.runFullTest(config, progress => {
        this.notify(progress);
      });

      // Construct Sample with TRAI QoS parameters
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
        device_model: Platform.OS === 'ios' ? 'Apple iPhone' : 'Android Device',
        os_platform: `${Platform.OS} ${Platform.Version}`,
        location_type: loc.accuracy && loc.accuracy < 25 ? 'Outdoor' : 'Indoor',
        lat: loc.lat,
        lng: loc.lng,
        accuracy: loc.accuracy,
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
