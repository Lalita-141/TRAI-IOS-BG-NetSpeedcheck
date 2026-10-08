import Geolocation from '@react-native-community/geolocation';
import { GeoLocationResult } from '../types';

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
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
          });
        },
        error => {
          console.warn('High accuracy location failed, attempting low accuracy fallback', error);
          // Fallback with lower accuracy & shorter timeout
          Geolocation.getCurrentPosition(
            fallbackPos => {
              resolve({
                lat: fallbackPos.coords.latitude,
                lng: fallbackPos.coords.longitude,
                accuracy: fallbackPos.coords.accuracy,
              });
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

  watchPosition(callback: (loc: GeoLocationResult) => void): number {
    this.init();
    return Geolocation.watchPosition(
      pos => {
        callback({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      err => {
        console.warn('watchPosition error', err);
      },
      {
        enableHighAccuracy: false,
        distanceFilter: 50,
        interval: 10000,
        fastestInterval: 5000,
      }
    );
  }

  clearWatch(watchId: number) {
    Geolocation.clearWatch(watchId);
  }
}

export const locationService = new LocationService();
