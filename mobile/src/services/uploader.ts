import { getConfig, getDeviceId } from '../config';
import { sampleStore } from './sampleStore';

// Don't refetch history more often than this unless forced (tab switches call it a lot)
const HISTORY_SYNC_MIN_INTERVAL_MS = 30 * 1000;
const HISTORY_FETCH_TIMEOUT_MS = 10 * 1000;
const MAX_SERVER_HISTORY = 500; // server-side cap of /v1/devices/:id/history

export interface HistorySyncResult {
  success: boolean;
  count?: number;
  skipped?: boolean;
  error?: string;
}

export interface UploadResult {
  uploadedCount: number;
  remainingPending: number;
  success: boolean;
  error?: string;
}

class Uploader {
  private busy = false;
  private historySyncInFlight: Promise<HistorySyncResult> | null = null;
  private lastHistorySyncAt = 0;

  async flush(): Promise<UploadResult> {
    if (this.busy) {
      const pending = await sampleStore.getPendingCount();
      return { uploadedCount: 0, remainingPending: pending, success: true };
    }

    this.busy = true;
    let totalUploaded = 0;

    try {
      const config = await getConfig();
      const serverUrl = config.serverUrl.replace(/\/+$/, '');
      const batchSize = config.batchSize || 20;

      while (true) {
        const batch = await sampleStore.getPending(batchSize);
        if (batch.length === 0) {
          break;
        }

        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 20000);

          const res = await fetch(`${serverUrl}/v1/speed-samples`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify({ samples: batch }),
            signal: controller.signal,
          });
          clearTimeout(timeout);

          if (!res.ok) {
            console.warn(`Server upload error status: ${res.status}`);
            const pendingCount = await sampleStore.getPendingCount();
            return {
              uploadedCount: totalUploaded,
              remainingPending: pendingCount,
              success: false,
              error: `HTTP ${res.status}: Upload rejected by server`,
            };
          }

          // Successfully uploaded batch, remove acknowledged IDs
          const ids = batch.map(s => s.id);
          await sampleStore.remove(ids);
          totalUploaded += batch.length;
        } catch (netErr: any) {
          console.warn('Network upload request error:', netErr);
          const pendingCount = await sampleStore.getPendingCount();
          return {
            uploadedCount: totalUploaded,
            remainingPending: pendingCount,
            success: false,
            error: netErr?.message || 'Network unreachable',
          };
        }
      }

      const remainingPending = await sampleStore.getPendingCount();
      return {
        uploadedCount: totalUploaded,
        remainingPending,
        success: true,
      };
    } finally {
      this.busy = false;
    }
  }

  /**
   * Requests immediate deletion of all server-side records associated with a device ID
   */
  async deleteServerRecordsForDevice(deviceId: string): Promise<{ success: boolean; count?: number; error?: string }> {
    try {
      const config = await getConfig();
      const serverUrl = config.serverUrl.replace(/\/+$/, '');
      const res = await fetch(`${serverUrl}/v1/speed-samples/device/${encodeURIComponent(deviceId)}`, {
        method: 'DELETE',
        headers: {
          Accept: 'application/json',
        },
      });

      if (!res.ok) {
        return { success: false, error: `Server responded with HTTP ${res.status}` };
      }

      const data = await res.json();
      // Server history is gone: drop the offline copy of it too (unsent samples stay)
      await sampleStore.clearSyncedHistory();
      return { success: true, count: data.deleted_count };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network request failed' };
    }
  }

  /**
   * Submits telecom service feedback or coverage complaint to backend
   */
  async submitFeedback(feedback: {
    deviceId: string;
    carrier?: string | null;
    rating: number;
    category?: string;
    comment?: string;
    lat?: number | null;
    lng?: number | null;
  }): Promise<{ success: boolean; id?: string; error?: string }> {
    try {
      const config = await getConfig();
      const serverUrl = config.serverUrl.replace(/\/+$/, '');
      const res = await fetch(`${serverUrl}/v1/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          device_id: feedback.deviceId,
          carrier: feedback.carrier,
          rating: feedback.rating,
          category: feedback.category,
          comment: feedback.comment,
          lat: feedback.lat,
          lng: feedback.lng,
        }),
      });

      if (!res.ok) {
        return { success: false, error: `HTTP ${res.status}: Failed to submit feedback` };
      }

      const data = await res.json();
      return { success: true, id: data.id };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error submitting feedback' };
    }
  }

  /**
   * Syncs and restores cloud test history for a specific device from backend
   */
  async fetchDeviceHistory(
    deviceId: string,
    limit: number = 100
  ): Promise<{ success: boolean; samples?: any[]; error?: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HISTORY_FETCH_TIMEOUT_MS);
    try {
      const config = await getConfig();
      const serverUrl = config.serverUrl.replace(/\/+$/, '');
      const res = await fetch(
        `${serverUrl}/v1/devices/${encodeURIComponent(deviceId)}/history?limit=${limit}`,
        {
          headers: {
            Accept: 'application/json',
          },
          signal: controller.signal,
        }
      );

      if (!res.ok) {
        return { success: false, error: `HTTP ${res.status}: Failed to fetch history` };
      }

      const data = await res.json();
      return { success: true, samples: data.samples || [] };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Cloud history sync failed' };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Online: uploads unsent samples, then replaces the offline history cache with
   * this device's history from the server (includes native background tests).
   * Offline / server error: leaves the cache untouched so History keeps working.
   */
  syncHistoryFromServer(force: boolean = false): Promise<HistorySyncResult> {
    if (this.historySyncInFlight) {
      return this.historySyncInFlight;
    }
    if (!force && Date.now() - this.lastHistorySyncAt < HISTORY_SYNC_MIN_INTERVAL_MS) {
      return Promise.resolve({ success: true, skipped: true });
    }

    this.historySyncInFlight = (async (): Promise<HistorySyncResult> => {
      try {
        // Upload first so the server list already contains this phone's newest tests
        await this.flush().catch(() => undefined);

        const deviceId = await getDeviceId();
        const limit = Math.min(sampleStore.getMaxHistoryLimit(), MAX_SERVER_HISTORY);
        const res = await this.fetchDeviceHistory(deviceId, limit);
        if (!res.success || !Array.isArray(res.samples)) {
          return { success: false, error: res.error || 'History fetch failed' };
        }

        await sampleStore.saveServerSnapshot(res.samples);
        this.lastHistorySyncAt = Date.now();
        return { success: true, count: res.samples.length };
      } catch (err: any) {
        return { success: false, error: err?.message || 'History sync failed' };
      } finally {
        this.historySyncInFlight = null;
      }
    })();
    return this.historySyncInFlight;
  }

  /**
   * Retrieves nearby operator benchmarks around given GPS coordinates
   */
  async fetchNearbyCoverage(
    lat: number,
    lng: number,
    radiusKm: number = 5
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const config = await getConfig();
      const serverUrl = config.serverUrl.replace(/\/+$/, '');
      const res = await fetch(
        `${serverUrl}/v1/coverage/nearby?lat=${lat}&lng=${lng}&radius_km=${radiusKm}`,
        {
          headers: {
            Accept: 'application/json',
          },
        }
      );

      if (!res.ok) {
        return { success: false, error: `HTTP ${res.status}: Nearby coverage failed` };
      }

      const data = await res.json();
      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Nearby coverage query failed' };
    }
  }

  /**
   * Fetches latest remote configuration from server
   */
  async fetchRemoteConfig(): Promise<{ success: boolean; config?: any; error?: string }> {
    try {
      const config = await getConfig();
      const serverUrl = config.serverUrl.replace(/\/+$/, '');
      const res = await fetch(`${serverUrl}/v1/config/app`, {
        headers: {
          Accept: 'application/json',
        },
      });

      if (!res.ok) {
        return { success: false, error: `HTTP ${res.status}: Remote config failed` };
      }

      const data = await res.json();
      return { success: true, config: data };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Config fetch failed' };
    }
  }
}

export const uploader = new Uploader();
