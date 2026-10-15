import { getConfig } from '../config';
import { sampleStore } from './sampleStore';

export interface UploadResult {
  uploadedCount: number;
  remainingPending: number;
  success: boolean;
  error?: string;
}

class Uploader {
  private busy = false;

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
      return { success: true, count: data.deleted_count };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network request failed' };
    }
  }
}

export const uploader = new Uploader();
