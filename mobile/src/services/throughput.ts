/**
 * Timed, multi-connection throughput measurement, the method used by tools such as Ookla
 * Speedtest and M-Lab NDT: several parallel transfers for a fixed time, speed sampled from
 * progress events, and the connection start-up period (TCP/TLS set-up, slow start) left out.
 * Upload counts only bytes the server has confirmed: upload progress events report bytes handed
 * to the phone's send buffer, which runs seconds ahead of the network on a slow uplink.
 * The native iOS background tester (NativeMonitorService.swift) uses the same numbers.
 */

export const TEST_DURATION_MS = 8000;
export const CONNECTIONS = 4;
// Share of the test at the start that is ignored while the connections ramp up
export const RAMP_UP_FRACTION = 0.3;
// A test ends early once this much data has moved, to bound mobile data and server bandwidth
export const DOWNLOAD_CAP_BYTES = 100 * 1024 * 1024;
export const UPLOAD_CAP_BYTES = 50 * 1024 * 1024;

const DOWNLOAD_REQUEST_MB = 20; // the server's largest /download response
// Upload chunks start small and double while they finish quickly, so confirmations stay frequent
const UPLOAD_CHUNK_MIN_BYTES = 64 * 1024;
const UPLOAD_CHUNK_MAX_BYTES = 8 * 1024 * 1024;
const UPLOAD_CHUNK_TARGET_MS = 500;
const LIVE_WINDOW_MS = 1000;
const LIVE_UPDATE_MS = 250;

export interface ThroughputPoint {
  t: number; // ms since the test started
  bytes: number; // total bytes moved by then
}

/** Bytes moved by time t, interpolated between progress points (0 bytes at t = 0). */
function bytesAt(points: ThroughputPoint[], t: number): number {
  let prev: ThroughputPoint = { t: 0, bytes: 0 };
  for (const p of points) {
    if (p.t >= t) {
      const span = p.t - prev.t;
      return span > 0 ? prev.bytes + ((p.bytes - prev.bytes) * (t - prev.t)) / span : p.bytes;
    }
    prev = p;
  }
  return prev.bytes;
}

/** Steady-state speed: bytes moved after the ramp-up period ÷ the time they took, in Mbps. */
export function steadyStateMbps(
  points: ThroughputPoint[],
  rampUpFraction: number = RAMP_UP_FRACTION
): number | null {
  const end = points[points.length - 1];
  if (!end || end.bytes <= 0 || end.t <= 0) return null;
  const from = end.t * rampUpFraction;
  const bytes = end.bytes - bytesAt(points, from);
  const seconds = (end.t - from) / 1000;
  return (bytes * 8) / 1_000_000 / seconds;
}

const uploadChunks = new Map<number, string>();
function getUploadChunk(bytes: number): string {
  // A plain string is sent as-is by React Native; typed arrays are base64-encoded on every send
  let chunk = uploadChunks.get(bytes);
  if (!chunk) {
    chunk = 'x'.repeat(bytes);
    uploadChunks.set(bytes, chunk);
  }
  return chunk;
}

export function measureThroughput(
  direction: 'download' | 'upload',
  serverUrl: string,
  onSpeed?: (mbps: number) => void
): Promise<number | null> {
  const cleanUrl = serverUrl.replace(/\/+$/, '');
  const cap = direction === 'download' ? DOWNLOAD_CAP_BYTES : UPLOAD_CAP_BYTES;

  return new Promise(resolve => {
    const start = Date.now();
    const points: ThroughputPoint[] = [];
    const active = new Set<XMLHttpRequest>();
    let total = 0;
    let openConnections = CONNECTIONS;
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearInterval(liveTimer);
      active.forEach(xhr => xhr.abort());
      active.clear();
      const mbps = steadyStateMbps(points);
      resolve(mbps != null ? parseFloat(mbps.toFixed(2)) : null);
    };

    const record = (delta: number) => {
      if (done || delta <= 0) return;
      total += delta;
      points.push({ t: Date.now() - start, bytes: total });
      if (total >= cap) finish();
    };

    // A connection that fails stops; the test ends early only when all of them have
    const connectionEnded = () => {
      openConnections--;
      if (openConnections === 0) finish();
    };

    const startRequest = (slot: number, uploadBytes: number = UPLOAD_CHUNK_MIN_BYTES) => {
      if (done) return;
      const xhr = new XMLHttpRequest();
      const requestStart = Date.now();
      let loaded = 0;
      const onBytes = (e: { loaded: number }) => {
        record(e.loaded - loaded);
        loaded = e.loaded;
      };

      xhr.onload = () => {
        active.delete(xhr);
        if (done) return;
        if (xhr.status < 200 || xhr.status >= 300) {
          connectionEnded();
          return;
        }
        if (direction === 'upload') {
          record(uploadBytes); // the server's reply confirms it received the whole chunk
          const quick = Date.now() - requestStart < UPLOAD_CHUNK_TARGET_MS;
          startRequest(slot, quick ? Math.min(uploadBytes * 2, UPLOAD_CHUNK_MAX_BYTES) : uploadBytes);
          return;
        }
        const size = (xhr.response as any)?.size ?? loaded;
        record(size - loaded);
        (xhr.response as any)?.close?.(); // frees the downloaded blob
        if (size <= 0) {
          connectionEnded(); // the server sent nothing; never count the requested size
          return;
        }
        startRequest(slot);
      };
      xhr.onerror = () => {
        active.delete(xhr);
        if (!done) connectionEnded();
      };

      if (direction === 'download') {
        xhr.open('GET', `${cleanUrl}/download?mb=${DOWNLOAD_REQUEST_MB}&_t=${Date.now()}_${slot}`);
        xhr.responseType = 'blob';
        xhr.setRequestHeader('Cache-Control', 'no-cache, no-store');
        xhr.onprogress = onBytes;
        active.add(xhr);
        xhr.send();
      } else {
        xhr.open('POST', `${cleanUrl}/upload?_t=${Date.now()}_${slot}`);
        xhr.setRequestHeader('Content-Type', 'application/octet-stream');
        active.add(xhr);
        xhr.send(getUploadChunk(uploadBytes));
      }
    };

    const timer = setTimeout(finish, TEST_DURATION_MS);
    const liveTimer = setInterval(() => {
      const now = Date.now() - start;
      if (!onSpeed || now < LIVE_WINDOW_MS) return;
      const bytes = bytesAt(points, now) - bytesAt(points, now - LIVE_WINDOW_MS);
      onSpeed(parseFloat(((bytes * 8) / 1_000_000 / (LIVE_WINDOW_MS / 1000)).toFixed(2)));
    }, LIVE_UPDATE_MS);

    for (let slot = 0; slot < CONNECTIONS; slot++) startRequest(slot);
  });
}
