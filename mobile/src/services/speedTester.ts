import { NativeModules } from 'react-native';
import NetInfo, { NetInfoStateType } from '@react-native-community/netinfo';
import { AppConfig, SpeedTestProgress } from '../types';

export interface SpeedResult {
  latency: number | null;
  jitter: number | null;
  packetLoss: number | null;
  downMbps: number | null;
  upMbps: number | null;
  networkType: string;
  radioTech: string | null;
  carrier: string | null;
}

let cachedIsp: { isp: string; timestamp: number } | null = null;

export async function resolvePublicISP(forceFresh: boolean = false): Promise<string | null> {
  const now = Date.now();
  if (!forceFresh && cachedIsp && now - cachedIsp.timestamp < 30 * 1000) {
    return cachedIsp.isp;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(`https://ipwho.is/?fields=connection,success&_t=${Date.now()}`, {
      headers: { 'Cache-Control': 'no-cache, no-store' },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (data?.success && data?.connection) {
        const rawIsp = (data.connection.isp || data.connection.org || '').trim();
        let cleaned = rawIsp;

        if (/reliance jio|jio/i.test(rawIsp)) {
          cleaned = 'Jio';
        } else if (/bharti airtel|airtel/i.test(rawIsp)) {
          cleaned = 'Airtel';
        } else if (/bsnl|bharat sanchar/i.test(rawIsp)) {
          cleaned = 'BSNL';
        } else if (/vodafone|idea|vi /i.test(rawIsp)) {
          cleaned = 'Vi';
        } else if (/atria|act fibernet/i.test(rawIsp)) {
          cleaned = 'ACT Fibernet';
        } else if (/tata/i.test(rawIsp)) {
          cleaned = 'Tata Play Fiber';
        } else if (/hathway/i.test(rawIsp)) {
          cleaned = 'Hathway';
        } else if (/excitel/i.test(rawIsp)) {
          cleaned = 'Excitel';
        } else if (rawIsp.length > 20) {
          cleaned = rawIsp.substring(0, 20);
        }

        if (cleaned) {
          cachedIsp = { isp: cleaned, timestamp: now };
          return cleaned;
        }
      }
    }
  } catch {
    // Non-blocking fallback
  }
  return null;
}

export class SpeedTester {
  /**
   * Measures latency, jitter, and packet loss using 5 round-trip HTTP probes (TRAI QoS Standard)
   */
  async measureLatencyAndJitter(
    serverUrl: string
  ): Promise<{ latency: number | null; jitter: number | null; packetLoss: number }> {
    const latencies: number[] = [];
    const totalPings = 5;
    const cleanUrl = serverUrl.replace(/\/+$/, '');

    for (let i = 0; i < totalPings; i++) {
      const start = Date.now();
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const res = await fetch(`${cleanUrl}/ping?_t=${Date.now()}_${i}`, {
          method: 'GET',
          headers: { 'Cache-Control': 'no-cache, no-store' },
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (res.ok) {
          const duration = Date.now() - start;
          latencies.push(duration);
        }
      } catch (err) {
        console.warn(`Ping attempt ${i + 1} failed:`, err);
      }
    }

    const packetLoss = Math.round(((totalPings - latencies.length) / totalPings) * 100);
    if (latencies.length === 0) {
      return { latency: null, jitter: null, packetLoss: 100 };
    }

    // Jitter calculation: average difference between consecutive latency measurements
    let jitter: number | null = null;
    if (latencies.length > 1) {
      let diffSum = 0;
      for (let i = 1; i < latencies.length; i++) {
        diffSum += Math.abs(latencies[i] - latencies[i - 1]);
      }
      jitter = parseFloat((diffSum / (latencies.length - 1)).toFixed(1));
    } else {
      jitter = 0;
    }

    // Median Latency
    const sorted = [...latencies].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const latency = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

    return {
      latency: Math.round(latency),
      jitter,
      packetLoss,
    };
  }

  /**
   * Measures download throughput from /download endpoint
   */
  async measureDownload(serverUrl: string, mb: number = 2): Promise<number | null> {
    const cleanUrl = serverUrl.replace(/\/+$/, '');
    const start = Date.now();

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000);

      const res = await fetch(`${cleanUrl}/download?mb=${mb}&_t=${Date.now()}`, {
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache, no-store' },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        console.warn('Download request failed with status', res.status);
        return null;
      }

      const blob = await res.blob();
      const bytes = blob.size || mb * 1024 * 1024;
      const durationSec = Math.max((Date.now() - start) / 1000, 0.001);
      const mbps = (bytes * 8) / 1_000_000 / durationSec;
      return parseFloat(mbps.toFixed(2));
    } catch (err) {
      console.warn('Download speed test failed:', err);
      return null;
    }
  }

  /**
   * Measures upload throughput by posting dummy binary payload to /upload
   */
  async measureUpload(serverUrl: string, mb: number = 1): Promise<number | null> {
    const cleanUrl = serverUrl.replace(/\/+$/, '');
    const byteLength = mb * 1024 * 1024;
    const dummyData = new Uint8Array(byteLength);

    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000);

      const res = await fetch(`${cleanUrl}/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        body: dummyData,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        console.warn('Upload request failed with status', res.status);
        return null;
      }

      const durationSec = Math.max((Date.now() - start) / 1000, 0.001);
      const mbps = (byteLength * 8) / 1_000_000 / durationSec;
      return parseFloat(mbps.toFixed(2));
    } catch (err) {
      console.warn('Upload speed test failed:', err);
      return null;
    }
  }

  /**
   * Obtains current network type, cellular carrier name or broadband ISP, and radio technology
   */
  async getNetworkContext(): Promise<{
    network: string;
    radio: string | null;
    carrier: string | null;
    isConnected: boolean;
  }> {
    let network = 'other';
    let radio: string | null = null;
    let carrier: string | null = null;
    let isConnected = true;

    try {
      // 1. Query NetInfo for active connection interface type
      const state = await NetInfo.fetch();
      isConnected = !!state.isConnected;

      if (!state.isConnected) {
        network = 'none';
      } else if (state.type === NetInfoStateType.wifi) {
        network = 'wifi';
        radio = 'Wi-Fi';
        // Resolve ISP / Provider of the active Wi-Fi or Hotspot gateway (bypass internal SIM)
        const isp = await resolvePublicISP(true);
        carrier = isp || 'Wi-Fi';
      } else if (state.type === NetInfoStateType.cellular) {
        network = 'cellular';

        // Query Native Telephony Module (iOS CoreTelephony SIM)
        if (NativeModules.TelephonyModule && NativeModules.TelephonyModule.getCellularInfo) {
          try {
            const telInfo = await NativeModules.TelephonyModule.getCellularInfo();
            if (telInfo) {
              if (telInfo.carrier && telInfo.carrier !== '--') carrier = telInfo.carrier;
              if (telInfo.radio) radio = telInfo.radio;
            }
          } catch (telErr) {
            console.warn('Native TelephonyModule query failed:', telErr);
          }
        }

        const details = state.details as { cellularGeneration?: string; carrier?: string } | null;
        if ((!carrier || carrier === '--') && details?.carrier) {
          carrier = details.carrier;
        }
        if (!radio && details?.cellularGeneration) {
          radio = details.cellularGeneration.toUpperCase();
        }
        if (!carrier || carrier === '--') {
          const isp = await resolvePublicISP(true);
          carrier = isp || (radio ? `${radio} Mobile` : 'Cellular');
        }
      } else if (state.type === NetInfoStateType.ethernet) {
        network = 'ethernet';
        radio = 'Ethernet';
        const isp = await resolvePublicISP(true);
        carrier = isp || 'LAN / Ethernet';
      }
    } catch (e) {
      console.warn('Failed to get network state:', e);
    }

    return {
      network,
      radio: radio || (network === 'wifi' ? 'Wi-Fi' : 'Cellular'),
      carrier: carrier && carrier !== '--' ? carrier : (network === 'wifi' ? 'Wi-Fi' : 'Cellular'),
      isConnected,
    };
  }

  /**
   * Runs the complete test sequence with progress updates
   */
  async runFullTest(
    config: AppConfig,
    onProgress?: (progress: SpeedTestProgress) => void
  ): Promise<SpeedResult> {
    const netContext = await this.getNetworkContext();

    if (!netContext.isConnected || netContext.network === 'none') {
      onProgress?.({
        phase: 'error',
        message: 'No internet connection detected',
        progressPercent: 0,
      });
      throw new Error('No internet connection');
    }

    if (config.wifiOnly && netContext.network !== 'wifi') {
      onProgress?.({
        phase: 'error',
        message: 'Wi-Fi only mode active, cellular test skipped',
        progressPercent: 0,
      });
      throw new Error('Wi-Fi only mode enabled');
    }

    // Step 1: Ping / Latency & Jitter (TRAI QoS probes)
    onProgress?.({
      phase: 'ping',
      message: 'Measuring QoS latency, jitter & packet loss...',
      progressPercent: 15,
    });
    const pingRes = await this.measureLatencyAndJitter(config.serverUrl);

    // Step 2: Download
    onProgress?.({
      phase: 'download',
      latency: pingRes.latency ?? undefined,
      message: `Downloading ${config.downloadMB} MB payload...`,
      progressPercent: 45,
    });
    const downMbps = await this.measureDownload(config.serverUrl, config.downloadMB);

    // Step 3: Upload
    onProgress?.({
      phase: 'upload',
      latency: pingRes.latency ?? undefined,
      downSpeed: downMbps ?? undefined,
      message: `Uploading ${config.uploadMB} MB payload...`,
      progressPercent: 75,
    });
    const upMbps = await this.measureUpload(config.serverUrl, config.uploadMB);

    // Final result
    onProgress?.({
      phase: 'complete',
      latency: pingRes.latency ?? undefined,
      downSpeed: downMbps ?? undefined,
      upSpeed: upMbps ?? undefined,
      message: 'Speed & QoS test completed successfully',
      progressPercent: 100,
    });

    return {
      latency: pingRes.latency,
      jitter: pingRes.jitter,
      packetLoss: pingRes.packetLoss,
      downMbps,
      upMbps,
      networkType: netContext.network,
      radioTech: netContext.radio,
      carrier: netContext.carrier,
    };
  }
}

export const speedTester = new SpeedTester();
