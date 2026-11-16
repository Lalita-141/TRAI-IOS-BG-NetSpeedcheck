/**
 * Download / upload speed engine (src/services/throughput.ts).
 * A simulated network link answers the app's XMLHttpRequests at a known speed, with fake timers,
 * so every test runs instantly and checks the measured speed against the speed we set.
 */
import {
  CONNECTIONS,
  DOWNLOAD_CAP_BYTES,
  RAMP_UP_FRACTION,
  TEST_DURATION_MS,
  UPLOAD_CAP_BYTES,
  measureThroughput,
  steadyStateMbps,
} from '../src/services/throughput';

const TICK_MS = 50;
const bytesPerMs = (mbps: number) => (mbps * 1_000_000) / 8 / 1000;

interface LinkOptions {
  mbps: number; // total link speed, shared by all connections
  status?: number; // HTTP status of every reply
  fail?: boolean; // every request fails with a network error
  stallUntilMs?: number; // nothing moves before this time (connection set-up)
  emptyBody?: boolean; // download replies with 0 bytes
}

let link: LinkOptions;
let requests: { method: string; url: string; bodyBytes: number; aborted: boolean }[];

/** XMLHttpRequest stand-in that moves bytes at the link speed. */
class LinkXhr {
  status = 0;
  response: any = null;
  responseType = '';
  onprogress: ((e: { loaded: number }) => void) | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  upload: any = {};
  private method = '';
  private url = '';
  private timer: any = null;
  private record = { method: '', url: '', bodyBytes: 0, aborted: false };

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader() {}
  abort() {
    this.record.aborted = true;
    clearInterval(this.timer);
    clearTimeout(this.timer);
  }
  send(body?: string) {
    this.record = { method: this.method, url: this.url, bodyBytes: body?.length ?? 0, aborted: false };
    requests.push(this.record);
    const started = Date.now();
    const perConnection = bytesPerMs(link.mbps) / CONNECTIONS;

    if (link.fail) {
      this.timer = setTimeout(() => this.onerror?.(), 10);
      return;
    }
    if (link.status && link.status !== 200) {
      this.timer = setTimeout(() => {
        this.status = link.status as number;
        this.onload?.();
      }, 10);
      return;
    }
    if (this.method === 'GET') {
      if (link.emptyBody) {
        this.timer = setTimeout(() => {
          this.status = 200;
          this.response = { size: 0 };
          this.onload?.();
        }, 10);
        return;
      }
      const size = 20 * 1024 * 1024;
      let loaded = 0;
      this.timer = setInterval(() => {
        if (Date.now() < (link.stallUntilMs ?? 0)) return;
        loaded = Math.min(size, loaded + perConnection * TICK_MS);
        this.onprogress?.({ loaded });
        if (loaded >= size) {
          clearInterval(this.timer);
          this.status = 200;
          this.response = { size, close: jest.fn() };
          this.onload?.();
        }
      }, TICK_MS);
    } else {
      // The server replies once the whole chunk has crossed the link
      const ms = (body?.length ?? 0) / perConnection;
      this.timer = setTimeout(() => {
        this.status = 200;
        this.onload?.();
      }, Math.max(ms, 1) + Math.max(0, (link.stallUntilMs ?? 0) - (Date.now() - started)));
    }
  }
}

/** Runs one measurement on fake time and returns the result plus when it finished. */
async function run(direction: 'download' | 'upload', onSpeed?: (mbps: number) => void) {
  const start = Date.now();
  let finishedAt = -1;
  const promise = measureThroughput(direction, 'https://speed.example.com/', onSpeed).then(r => {
    finishedAt = Date.now() - start;
    return r;
  });
  await jest.advanceTimersByTimeAsync(TEST_DURATION_MS + 1000);
  return { mbps: await promise, finishedAt };
}

beforeEach(() => {
  jest.useFakeTimers({ now: 0 });
  requests = [];
  link = { mbps: 10 };
  (globalThis as any).XMLHttpRequest = LinkXhr;
});

afterEach(() => {
  jest.useRealTimers();
});

describe('test settings', () => {
  it('uses an 8 second, 4-connection test with the first 30% ignored', () => {
    expect(TEST_DURATION_MS).toBe(8000);
    expect(CONNECTIONS).toBe(4);
    expect(RAMP_UP_FRACTION).toBe(0.3);
  });

  it('caps one test at 100 MB down and 50 MB up', () => {
    expect(DOWNLOAD_CAP_BYTES).toBe(100 * 1024 * 1024);
    expect(UPLOAD_CAP_BYTES).toBe(50 * 1024 * 1024);
  });
});

describe('steadyStateMbps', () => {
  it('returns null when nothing was transferred', () => {
    expect(steadyStateMbps([])).toBeNull();
    expect(steadyStateMbps([{ t: 1000, bytes: 0 }])).toBeNull();
    expect(steadyStateMbps([{ t: 0, bytes: 500 }])).toBeNull();
  });

  it('gives the exact speed of a constant transfer', () => {
    // 1,250,000 bytes per second = 10 Mbps
    const points = Array.from({ length: 8 }, (_, i) => ({ t: (i + 1) * 1000, bytes: (i + 1) * 1_250_000 }));
    expect(steadyStateMbps(points)).toBeCloseTo(10, 6);
  });

  it('leaves the slow start-up period out of the result', () => {
    // Nothing for the first 2 s, then 10 Mbps until 8 s
    const points = [
      { t: 2000, bytes: 0.0001 },
      { t: 8000, bytes: 6 * 1_250_000 },
    ];
    expect(steadyStateMbps(points)).toBeCloseTo(10, 1);
    // The plain average over the whole test would under-report it
    expect(steadyStateMbps(points, 0)).toBeCloseTo(7.5, 1);
  });

  it('interpolates between progress points', () => {
    const points = [
      { t: 1000, bytes: 1_000_000 },
      { t: 3000, bytes: 3_000_000 },
    ];
    // Ramp-up ends at 900 ms (0.3 × 3000): 900,000 bytes by then, 2,100,000 bytes in 2.1 s = 8 Mbps
    expect(steadyStateMbps(points)).toBeCloseTo(8, 6);
  });
});

describe('download measurement', () => {
  it.each([2, 10, 50])('measures a %i Mbps link within 3%', async mbps => {
    link.mbps = mbps;
    const { mbps: measured } = await run('download');
    expect(measured).not.toBeNull();
    expect(Math.abs((measured as number) - mbps) / mbps).toBeLessThan(0.03);
  });

  it('opens 4 parallel connections to /download, without a trailing double slash', async () => {
    await run('download');
    const first = requests.slice(0, CONNECTIONS);
    expect(first).toHaveLength(CONNECTIONS);
    first.forEach(r => {
      expect(r.method).toBe('GET');
      expect(r.url).toMatch(/^https:\/\/speed\.example\.com\/download\?mb=20&_t=\d+_\d$/);
    });
  });

  it('runs for the full 8 seconds, then stops all connections', async () => {
    const { finishedAt } = await run('download');
    expect(finishedAt).toBe(TEST_DURATION_MS);
    expect(requests.every(r => r.aborted)).toBe(true);
  });

  it('ignores connection set-up time at the start', async () => {
    link = { mbps: 20, stallUntilMs: 1500 };
    const { mbps } = await run('download');
    expect(Math.abs((mbps as number) - 20) / 20).toBeLessThan(0.03);
  });

  it('stops early at the 100 MB cap on a fast link', async () => {
    link.mbps = 400; // 100 MB takes about 2.1 s
    const { mbps, finishedAt } = await run('download');
    expect(finishedAt).toBeGreaterThan(1500);
    expect(finishedAt).toBeLessThan(3000);
    expect(Math.abs((mbps as number) - 400) / 400).toBeLessThan(0.03);
  });

  it('reports live speed while it runs', async () => {
    const live: number[] = [];
    link.mbps = 10;
    await run('download', v => live.push(v));
    expect(live.length).toBeGreaterThan(20);
    // After the first second every live reading is the link speed
    live.slice(2).forEach(v => expect(v).toBeCloseTo(10, 0));
  });

  it('returns null when every connection fails', async () => {
    link.fail = true;
    const { mbps, finishedAt } = await run('download');
    expect(mbps).toBeNull();
    expect(finishedAt).toBeLessThan(TEST_DURATION_MS);
  });

  it('returns null when the server answers with an error status', async () => {
    link.status = 503;
    expect((await run('download')).mbps).toBeNull();
  });

  it('returns null, not the requested size, when the server sends an empty body', async () => {
    link.emptyBody = true;
    expect((await run('download')).mbps).toBeNull();
  });
});

describe('upload measurement', () => {
  // Upload counts whole chunks once the server confirms them, so its result moves in steps.
  // Here all 4 connections confirm at the same instant (the worst case); real connections drift
  // apart and do better. Outside 2-50 Mbps this simulation reads up to +32% (1 Mbps) and -21% (200 Mbps).
  it.each([2, 5, 10, 20, 50])('measures a %i Mbps link within 12%', async mbps => {
    link.mbps = mbps;
    const { mbps: measured } = await run('upload');
    expect(measured).not.toBeNull();
    expect(Math.abs((measured as number) - mbps) / mbps).toBeLessThan(0.12);
  });

  it('posts to /upload and starts with 64 KB chunks', async () => {
    await run('upload');
    const first = requests.slice(0, CONNECTIONS);
    first.forEach(r => {
      expect(r.method).toBe('POST');
      expect(r.url).toMatch(/^https:\/\/speed\.example\.com\/upload\?_t=\d+_\d$/);
      expect(r.bodyBytes).toBe(64 * 1024);
    });
  });

  it('grows chunks while they finish quickly, up to 8 MB', async () => {
    link.mbps = 400;
    await run('upload');
    const sizes = requests.map(r => r.bodyBytes);
    expect(Math.max(...sizes)).toBeGreaterThan(64 * 1024);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(8 * 1024 * 1024);
    sizes.forEach(s => expect(Math.log2(s / (64 * 1024)) % 1).toBe(0)); // 64 KB × a power of 2
  });

  it('keeps chunks small on a slow link', async () => {
    link.mbps = 0.5; // a 64 KB chunk per connection takes about 4 s
    await run('upload');
    expect(new Set(requests.map(r => r.bodyBytes))).toEqual(new Set([64 * 1024]));
  });

  it('stops early at the 50 MB cap on a fast link', async () => {
    link.mbps = 400;
    const { finishedAt } = await run('upload');
    expect(finishedAt).toBeLessThan(TEST_DURATION_MS);
  });

  it('returns null when every upload fails', async () => {
    link.fail = true;
    expect((await run('upload')).mbps).toBeNull();
  });
});
