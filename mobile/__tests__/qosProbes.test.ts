/**
 * Video start-up delay, streaming speed and web page timing (src/services/qosProbes.ts).
 * A fake XMLHttpRequest replies with headers and body at set times, on fake timers.
 */
import { measureVideo, measureVideoAndWeb, measureWeb, qualityForMbps } from '../src/services/qosProbes';

interface Reply {
  headersAtMs?: number; // response headers arrive (first byte)
  doneAtMs?: number; // whole body has arrived
  bytes?: number;
  status?: number;
  outcome?: 'error' | 'timeout';
}

let replies: Record<string, Reply>;
let sent: { url: string; timeout: number; responseType: string; headers: Record<string, string> }[];

class TimedXhr {
  status = 0;
  readyState = 0;
  response: any = null;
  responseType = '';
  timeout = 0;
  onreadystatechange: (() => void) | null = null;
  onprogress: (() => void) | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  private url = '';
  private headers: Record<string, string> = {};

  open(_method: string, url: string) {
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send() {
    sent.push({ url: this.url, timeout: this.timeout, responseType: this.responseType, headers: this.headers });
    const path = Object.keys(replies).find(p => this.url.includes(p)) as string;
    const r = replies[path];
    if (r.outcome === 'error') {
      setTimeout(() => this.onerror?.(), 10);
      return;
    }
    if (r.outcome === 'timeout') {
      setTimeout(() => this.ontimeout?.(), this.timeout);
      return;
    }
    setTimeout(() => {
      this.readyState = 2;
      this.onreadystatechange?.();
    }, r.headersAtMs ?? 0);
    setTimeout(() => {
      this.status = r.status ?? 200;
      this.readyState = 4;
      this.response = { size: r.bytes ?? 0, close: jest.fn() };
      this.onreadystatechange?.();
      this.onload?.();
    }, r.doneAtMs ?? 0);
  }
}

async function settle<T>(promise: Promise<T>): Promise<T> {
  await jest.advanceTimersByTimeAsync(20000);
  return promise;
}

beforeEach(() => {
  jest.useFakeTimers({ now: 0 });
  sent = [];
  replies = {
    '/test-video': { headersAtMs: 200, doneAtMs: 1200, bytes: 1_250_000 }, // 10 Mbps after start
    '/test-webpage': { headersAtMs: 150, doneAtMs: 900, bytes: 50_000 },
  };
  (globalThis as any).XMLHttpRequest = TimedXhr;
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('qualityForMbps', () => {
  it.each([
    [100, '4K Ultra HD'],
    [25, '4K Ultra HD'],
    [24.99, '1080p Full HD'],
    [8, '1080p Full HD'],
    [7.9, '720p HD'],
    [5, '720p HD'],
    [4.9, '480p'],
    [2.5, '480p'],
    [2.4, '360p'],
    [0, '360p'],
  ])('%p Mbps sustains %p', (mbps, quality) => {
    expect(qualityForMbps(mbps)).toBe(quality);
  });
});

describe('measureVideo', () => {
  it('reports the start delay and the speed after the stream started', async () => {
    const result = await settle(measureVideo('https://qos.example.com/'));
    expect(result.videoDelayMs).toBe(200);
    // 1,250,000 bytes in the 1000 ms after the first byte = 10 Mbps
    expect(result.videoMbps).toBe(10);
    expect(result.streamingQuality).toBe('1080p Full HD');
  });

  it('does not count the start delay as streaming time', async () => {
    replies['/test-video'] = { headersAtMs: 3000, doneAtMs: 4000, bytes: 1_250_000 };
    const result = await settle(measureVideo('https://qos.example.com'));
    expect(result.videoDelayMs).toBe(3000);
    expect(result.videoMbps).toBe(10);
  });

  it('requests /test-video uncached, as a blob, with a 15 s timeout', async () => {
    await settle(measureVideo('https://qos.example.com/'));
    expect(sent[0].url).toMatch(/^https:\/\/qos\.example\.com\/test-video\?_t=\d+$/);
    expect(sent[0].timeout).toBe(15000);
    expect(sent[0].responseType).toBe('blob');
    expect(sent[0].headers['Cache-Control']).toBe('no-cache, no-store');
  });

  it.each([
    ['a network error', { outcome: 'error' as const }],
    ['a timeout', { outcome: 'timeout' as const }],
    ['an HTTP error', { headersAtMs: 100, doneAtMs: 200, bytes: 500, status: 500 }],
    ['an empty body', { headersAtMs: 100, doneAtMs: 200, bytes: 0 }],
  ])('returns no values after %s', async (_label, reply) => {
    replies['/test-video'] = reply;
    expect(await settle(measureVideo('https://qos.example.com'))).toEqual({
      videoDelayMs: null,
      videoMbps: null,
      streamingQuality: null,
    });
  });
});

describe('measureWeb', () => {
  it('reports time to first byte and full page load time', async () => {
    const result = await settle(measureWeb('https://qos.example.com'));
    expect(result).toEqual({ ttfbMs: 150, pageLoadSec: 0.9 });
  });

  it('requests /test-webpage with an 8 s timeout', async () => {
    await settle(measureWeb('https://qos.example.com/'));
    expect(sent[0].url).toMatch(/^https:\/\/qos\.example\.com\/test-webpage\?_t=\d+$/);
    expect(sent[0].timeout).toBe(8000);
  });

  it('returns no values when the page fails', async () => {
    replies['/test-webpage'] = { outcome: 'error' };
    expect(await settle(measureWeb('https://qos.example.com'))).toEqual({ ttfbMs: null, pageLoadSec: null });
  });

  it('returns no values on an HTTP error', async () => {
    replies['/test-webpage'] = { headersAtMs: 50, doneAtMs: 60, status: 404 };
    expect(await settle(measureWeb('https://qos.example.com'))).toEqual({ ttfbMs: null, pageLoadSec: null });
  });
});

describe('measureVideoAndWeb', () => {
  it('runs the video probe, then the web probe, and merges the results', async () => {
    const result = await settle(measureVideoAndWeb('https://qos.example.com'));
    expect(result).toEqual({
      videoDelayMs: 200,
      videoMbps: 10,
      streamingQuality: '1080p Full HD',
      ttfbMs: 150,
      pageLoadSec: 0.9,
    });
    expect(sent.map(s => s.url.split('?')[0])).toEqual([
      'https://qos.example.com/test-video',
      'https://qos.example.com/test-webpage',
    ]);
  });

  it('keeps the web result when only the video fails', async () => {
    replies['/test-video'] = { outcome: 'error' };
    const result = await settle(measureVideoAndWeb('https://qos.example.com'));
    expect(result.videoMbps).toBeNull();
    expect(result.ttfbMs).toBe(150);
  });
});
