export interface VideoWebProbeResult {
  videoDelayMs: number | null; // time until the video stream starts responding
  videoMbps: number | null; // throughput while pulling the video stream
  streamingQuality: string | null; // highest resolution the throughput sustains
  ttfbMs: number | null; // web page time-to-first-byte
  pageLoadSec: number | null; // full web page download time
}

/**
 * Times a GET with XMLHttpRequest events. React Native's fetch() only resolves once the whole
 * body has arrived, so it cannot tell when the first response came back.
 */
function timedFetch(
  url: string,
  timeoutMs: number
): Promise<{ firstByteMs: number; totalMs: number; bytes: number } | null> {
  return new Promise(resolve => {
    const xhr = new XMLHttpRequest();
    const start = Date.now();
    let firstByteAt: number | null = null;
    const markFirstByte = () => {
      if (firstByteAt == null) firstByteAt = Date.now();
    };

    xhr.onreadystatechange = () => {
      if (xhr.readyState >= 2) markFirstByte(); // HEADERS_RECEIVED: the first bytes of the response
    };
    xhr.onprogress = markFirstByte;
    xhr.onload = () => {
      const end = Date.now();
      markFirstByte();
      if (xhr.status < 200 || xhr.status >= 300) {
        resolve(null);
        return;
      }
      const response: any = xhr.response;
      const bytes = response?.size ?? 0;
      response?.close?.();
      resolve({
        firstByteMs: (firstByteAt as number) - start,
        totalMs: Math.max(end - start, 1),
        bytes,
      });
    };
    xhr.onerror = () => resolve(null);
    xhr.ontimeout = () => resolve(null);

    xhr.open('GET', url);
    xhr.responseType = 'blob';
    xhr.timeout = timeoutMs;
    xhr.setRequestHeader('Cache-Control', 'no-cache, no-store');
    xhr.send();
  });
}

export function qualityForMbps(mbps: number): string {
  if (mbps >= 25) return '4K Ultra HD';
  if (mbps >= 8) return '1080p Full HD';
  if (mbps >= 5) return '720p HD';
  if (mbps >= 2.5) return '480p';
  return '360p';
}

/** Video start-up delay and streaming throughput, from /test-video on the QoS server. */
export async function measureVideo(serverUrl: string) {
  const cleanUrl = serverUrl.replace(/\/+$/, '');
  try {
    const video = await timedFetch(`${cleanUrl}/test-video?_t=${Date.now()}`, 15000);
    if (video && video.bytes > 0) {
      // Speed of the stream once it started; the start delay is reported on its own
      const streamMs = Math.max(video.totalMs - video.firstByteMs, 1);
      const mbps = (video.bytes * 8) / 1_000_000 / (streamMs / 1000);
      return {
        videoDelayMs: video.firstByteMs as number | null,
        videoMbps: parseFloat(mbps.toFixed(2)) as number | null,
        streamingQuality: qualityForMbps(mbps) as string | null,
      };
    }
  } catch (err) {
    console.warn('Video probe failed:', err);
  }
  return { videoDelayMs: null, videoMbps: null, streamingQuality: null };
}

/** Web page time-to-first-byte and load time, from /test-webpage on the QoS server. */
export async function measureWeb(serverUrl: string) {
  const cleanUrl = serverUrl.replace(/\/+$/, '');
  try {
    const web = await timedFetch(`${cleanUrl}/test-webpage?_t=${Date.now()}`, 8000);
    if (web) {
      return {
        ttfbMs: web.firstByteMs as number | null,
        pageLoadSec: parseFloat((web.totalMs / 1000).toFixed(2)) as number | null,
      };
    }
  } catch (err) {
    console.warn('Web page probe failed:', err);
  }
  return { ttfbMs: null, pageLoadSec: null };
}

export async function measureVideoAndWeb(serverUrl: string): Promise<VideoWebProbeResult> {
  return { ...(await measureVideo(serverUrl)), ...(await measureWeb(serverUrl)) };
}
