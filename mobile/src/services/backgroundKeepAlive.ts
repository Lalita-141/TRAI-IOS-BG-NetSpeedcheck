import { useEffect } from 'react';
import { NativeModules, PermissionsAndroid, Platform } from 'react-native';

export interface KeepAliveOptions {
  // iOS: also ask the system to relaunch the app after it was killed (significant location change)
  relaunchAfterKill?: boolean;
}

function getAndroidService(): any {
  if (Platform.OS !== 'android' || !NativeModules.RNBackgroundActions) return null;
  try {
    return require('react-native-background-actions').default;
  } catch (err) {
    console.log('Background actions not loaded', err);
    return null;
  }
}

/**
 * Keeps the JS runtime running with the screen off / app in background while at
 * least one feature holds it.
 * iOS: low-power native location session (NativeKeepAlive).
 * Android: one foreground service shared by all features (it is what keeps JS timers running).
 */
class BackgroundKeepAlive {
  private holders: Set<string> = new Set();
  private androidQueue: Promise<void> = Promise.resolve();

  isHeld(tag: string): boolean {
    return this.holders.has(tag);
  }

  acquire(tag: string, options: KeepAliveOptions = {}) {
    if (this.holders.has(tag)) return;
    this.holders.add(tag);

    const bridge = NativeModules.NativeMonitorBridge;
    if (Platform.OS === 'ios' && bridge && typeof bridge.acquireKeepAlive === 'function') {
      bridge.acquireKeepAlive(tag, !!options.relaunchAfterKill).catch(() => {});
    }
    this.syncAndroidService();
  }

  /** Always reaches native: a relaunched app must be able to drop a holder from before it was killed. */
  release(tag: string) {
    this.holders.delete(tag);

    const bridge = NativeModules.NativeMonitorBridge;
    if (Platform.OS === 'ios' && bridge && typeof bridge.releaseKeepAlive === 'function') {
      bridge.releaseKeepAlive(tag).catch(() => {});
    }
    this.syncAndroidService();
  }

  // Serialized so a start and a stop of the service can never overlap
  private syncAndroidService(): Promise<void> {
    this.androidQueue = this.androidQueue.then(async () => {
      const service = getAndroidService();
      if (!service) return;
      try {
        const wanted = this.holders.size > 0;
        if (wanted === service.isRunning()) return;
        if (!wanted) {
          await service.stop();
          return;
        }
        const foregroundServiceType = await this.resolveAndroidServiceType();
        // Runs until service.stop(); returning would make the library stop the service itself
        const runner = () => new Promise<void>(() => {});
        await service.start(runner, {
          taskName: 'NetSpeedMonitor',
          taskTitle: 'NetSpeed Monitor Active',
          taskDesc: 'Measuring network quality in the background',
          taskIcon: {
            name: 'ic_launcher',
            type: 'mipmap',
          },
          color: '#06B6D4',
          foregroundServiceType,
        });
      } catch (e) {
        console.warn('Background keep-alive service error:', e);
      }
    });
    return this.androidQueue;
  }

  /**
   * "location" has no daily time limit but Android refuses it without location
   * permission, so fall back to "dataSync". Must match AndroidManifest.xml.
   */
  private async resolveAndroidServiceType(): Promise<string[]> {
    const { ACCESS_FINE_LOCATION, ACCESS_COARSE_LOCATION, POST_NOTIFICATIONS } = PermissionsAndroid.PERMISSIONS;
    if ((Platform.Version as number) >= 33) {
      PermissionsAndroid.request(POST_NOTIFICATIONS).catch(() => {});
    }
    const hasLocation =
      (await PermissionsAndroid.check(ACCESS_FINE_LOCATION)) ||
      (await PermissionsAndroid.check(ACCESS_COARSE_LOCATION));
    return [hasLocation ? 'location' : 'dataSync'];
  }
}

export const backgroundKeepAlive = new BackgroundKeepAlive();

/** React hook: test screens hold the keep-alive for as long as they are mounted. */
export function useBackgroundKeepAlive(tag: string) {
  useEffect(() => {
    backgroundKeepAlive.acquire(tag);
    return () => backgroundKeepAlive.release(tag);
  }, [tag]);
}
