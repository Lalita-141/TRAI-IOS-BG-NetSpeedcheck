import Geolocation, { GeolocationResponse } from '@react-native-community/geolocation';
import { GeoLocationResult } from '../types';

function toResult(pos: GeolocationResponse): GeoLocationResult {
  const speed = pos.coords.speed;
  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: pos.coords.accuracy,
    timestamp: pos.timestamp ?? null,
    // Platforms report a negative speed when it is unknown
    speed: speed != null && speed >= 0 ? speed : null,
  };
}

export interface WatchOptions {
  enableHighAccuracy?: boolean;
  distanceFilter?: number; // metres
  interval?: number; // ms (Android)
}

class LocationService {
  private initialized = false;

  init() {
    if (this.initialized) return;
    this.initialized = true;
    Geolocation.setRNConfiguration({
      skipPermissionRequests: false,
      authorizationLevel: 'always',
      enableBackgroundLocationUpdates: true,
      locationProvider: 'auto',
    });
  }

  async requestPermission(): Promise<boolean> {
    this.init();
    return new Promise(resolve => {
      let resolved = false;
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(true);
        }
      }, 500);

      try {
        Geolocation.requestAuthorization(
          () => {
            if (!resolved) {
              resolved = true;
              clearTimeout(timer);
              resolve(true);
            }
          },
          error => {
            console.warn('Location authorization request rejected/failed', error);
            if (!resolved) {
              resolved = true;
              clearTimeout(timer);
              resolve(false);
            }
          }
        );
      } catch (e) {
        console.warn('Geolocation.requestAuthorization error', e);
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve(true);
        }
      }
    });
  }

  async getCurrentLocation(): Promise<GeoLocationResult> {
    this.init();
    return new Promise(resolve => {
      // First attempt with high accuracy
      Geolocation.getCurrentPosition(
        position => {
          resolve(toResult(position));
        },
        error => {
          console.warn('High accuracy location failed, attempting low accuracy fallback', error);
          // Fallback with lower accuracy & shorter timeout
          Geolocation.getCurrentPosition(
            fallbackPos => {
              resolve(toResult(fallbackPos));
            },
            fallbackErr => {
              console.warn('Location retrieval completely failed', fallbackErr);
              resolve({ lat: null, lng: null, accuracy: null });
            },
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
          );
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
      );
    });
  }

  /** Defaults suit background monitoring; coverage surveys pass high-accuracy options. */
  watchPosition(callback: (loc: GeoLocationResult) => void, options: WatchOptions = {}): number {
    this.init();
    return Geolocation.watchPosition(
      pos => {
        callback(toResult(pos));
      },
      err => {
        console.warn('watchPosition error', err);
      },
      {
        enableHighAccuracy: options.enableHighAccuracy ?? false,
        distanceFilter: options.distanceFilter ?? 50,
        interval: options.interval ?? 10000,
        fastestInterval: 5000,
      }
    );
  }

  clearWatch(watchId: number) {
    Geolocation.clearWatch(watchId);
  }
}

export const locationService = new LocationService();
