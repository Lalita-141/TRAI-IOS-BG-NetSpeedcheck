export interface VideoWebProbeResult {
  videoDelayMs: number | null; // time until the video stream starts responding
  videoMbps: number | null; // throughput while pulling the video stream
  streamingQuality: string | null; // highest resolution the throughput sustains
  ttfbMs: number | null; // web page time-to-first-byte
  pageLoadSec: number | null; // full web page download time
}

async function timedFetch(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const start = Date.now();
    const res = await fetch(url, {
      headers: { 'Cache-Control': 'no-cache, no-store' },
      signal: controller.signal,
    });
    const headersAt = Date.now();
    if (!res.ok) {
      return null;
    }
    const blob = await res.blob();
    return {
      firstByteMs: headersAt - start,
      totalMs: Math.max(Date.now() - start, 1),
      bytes: blob.size,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function qualityForMbps(mbps: number): string {
  if (mbps >= 25) return '4K Ultra HD';
  if (mbps >= 8) return '1080p Full HD';
  if (mbps >= 5) return '720p HD';
  if (mbps >= 2.5) return '480p';
  return '360p';
}

/**
 * Measures video start-up delay / streaming throughput (/test-video) and web
 * page TTFB / load time (/test-webpage) against the QoS server.
 */
export async function measureVideoAndWeb(serverUrl: string): Promise<VideoWebProbeResult> {
  const cleanUrl = serverUrl.replace(/\/+$/, '');
  const result: VideoWebProbeResult = {
    videoDelayMs: null,
    videoMbps: null,
    streamingQuality: null,
    ttfbMs: null,
    pageLoadSec: null,
  };

  try {
    const video = await timedFetch(`${cleanUrl}/test-video?_t=${Date.now()}`, 15000);
    if (video) {
      result.videoDelayMs = video.firstByteMs;
      const mbps = (video.bytes * 8) / 1_000_000 / (video.totalMs / 1000);
      result.videoMbps = parseFloat(mbps.toFixed(2));
      result.streamingQuality = qualityForMbps(mbps);
    }
  } catch (err) {
    console.warn('Video probe failed:', err);
  }

  try {
    const web = await timedFetch(`${cleanUrl}/test-webpage?_t=${Date.now()}`, 8000);
    if (web) {
      result.ttfbMs = web.firstByteMs;
      result.pageLoadSec = parseFloat((web.totalMs / 1000).toFixed(2));
    }
  } catch (err) {
    console.warn('Web page probe failed:', err);
  }

  return result;
}
