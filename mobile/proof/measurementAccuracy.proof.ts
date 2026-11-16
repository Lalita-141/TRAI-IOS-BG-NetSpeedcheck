/**
 * Accuracy proof: runs the app's real measurement code against the real server.js
 * through a local link with a KNOWN speed and delay, then compares measured with known.
 * Run with: npm run proof
 * The server's database is replaced by stubDb.js, so no real data is read or written.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}));
jest.mock('@react-native-community/netinfo', () => ({ fetch: jest.fn(), NetInfoStateType: {} }));
jest.mock('@react-native-community/geolocation', () => ({}));

import { speedTester } from '../src/services/speedTester';
import { measureVideo, measureWeb, qualityForMbps } from '../src/services/qosProbes';

declare const require: any;
declare const __dirname: string;
declare const process: any;
declare const Buffer: any;

const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const SERVER_PORT = 18770;
const PROXY_PORT = 18771;
const LINK = `http://127.0.0.1:${PROXY_PORT}`;
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(() => resolve(), ms));

// What the simulated link does. Changed by each test.
let link: { mbps: number; delayMs: number; pingDelays?: number[]; failPings?: number[] };
let pingCount = 0;
let server: any;
let proxy: any;
const rows: string[] = [];

// All connections share one simulated link, so 4 parallel transfers split link.mbps between them
let linkFreeAt = 0;
// Bumped for every test, so data an earlier test left in socket buffers never uses this test's link
let generation = 0;
async function throughLink(bytes: number) {
  const bytesPerMs = (link.mbps * 1_000_000) / 8 / 1000;
  linkFreeAt = Math.max(linkFreeAt, Date.now()) + bytes / bytesPerMs;
  const wait = linkFreeAt - Date.now();
  if (wait > 0) await sleep(wait);
}

const PIECE = 64 * 1024;

/** Sends a body at exactly link.mbps, stopping if the client goes away. */
async function writePaced(res: any, body: any, gen: number) {
  for (let sent = 0; sent < body.length && !res.destroyed && gen === generation; sent += PIECE) {
    const piece = body.subarray(sent, sent + PIECE);
    await throughLink(piece.length);
    if (!res.destroyed) res.write(piece);
  }
  if (!res.destroyed) res.end();
}

/**
 * Minimal XMLHttpRequest for Node, so the proof runs the same XHR code the phone runs.
 * Progress is reported as data arrives (download) or is handed to the socket (upload), like iOS.
 */
class NodeXHR {
  readyState = 0;
  status = 0;
  response: any = null;
  responseType = '';
  timeout = 0;
  onreadystatechange: any = null;
  onprogress: any = null;
  onload: any = null;
  onerror: any = null;
  ontimeout: any = null;
  upload: any = { onprogress: null };
  private method = 'GET';
  private url = '';
  private headers: any = {};
  private req: any = null;
  private finished = false;

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  abort() {
    this.finished = true;
    this.req?.destroy();
  }
  private fail(handler: any) {
    if (this.finished) return;
    this.finished = true;
    handler?.();
  }
  send(body?: any) {
    const u = new URL(this.url);
    const data = body == null ? null : Buffer.from(body);
    const headers = { ...this.headers, ...(data ? { 'Content-Length': data.length } : {}) };
    const req = http.request(
      { hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: this.method, headers },
      (res: any) => {
        this.status = res.statusCode;
        this.readyState = 2;
        this.onreadystatechange?.();
        const chunks: any[] = [];
        let loaded = 0;
        res.on('data', (c: any) => {
          chunks.push(c);
          loaded += c.length;
          this.readyState = 3;
          if (!this.finished) this.onprogress?.({ loaded });
        });
        res.on('end', () => {
          if (this.finished) return;
          this.finished = true;
          const all = Buffer.concat(chunks);
          this.response = this.responseType === 'blob' ? { size: all.length } : all.toString();
          this.readyState = 4;
          this.onreadystatechange?.();
          this.onload?.();
        });
        res.on('error', () => this.fail(this.onerror));
      }
    );
    req.on('error', () => this.fail(this.onerror));
    if (this.timeout) {
      req.setTimeout(this.timeout, () => {
        this.fail(this.ontimeout);
        req.destroy();
      });
    }
    this.req = req;
    if (!data) {
      req.end();
      return;
    }
    let sent = 0;
    const writeNext = () => {
      if (this.finished) return;
      if (sent >= data.length) {
        req.end();
        return;
      }
      const piece = data.subarray(sent, sent + PIECE);
      sent += piece.length;
      req.write(piece, () => {
        if (!this.finished) this.upload.onprogress?.({ loaded: sent });
        writeNext();
      });
    };
    writeNext();
  }
}

function forward(method: string, url: string, body?: any): Promise<{ status: number; headers: any; body: any }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ port: SERVER_PORT, method, path: url, headers: { 'Content-Type': 'application/octet-stream' } }, (res: any) => {
      const chunks: any[] = [];
      res.on('data', (c: any) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

function startProxy() {
  return http.createServer(async (req: any, res: any) => {
    if (req.url.startsWith('/ping')) {
      const index = pingCount++;
      await sleep(link.pingDelays ? link.pingDelays[index] : link.delayMs);
      if (link.failPings?.includes(index)) {
        res.writeHead(500);
        res.end();
        return;
      }
    } else {
      await sleep(link.delayMs);
    }

    const gen = generation;
    let upload;
    if (req.method === 'POST') {
      // Receives the upload at exactly link.mbps
      const chunks: any[] = [];
      try {
        for await (const chunk of req) {
          if (gen !== generation) {
            req.destroy();
            return;
          }
          chunks.push(chunk);
          await throughLink(chunk.length);
        }
      } catch {
        return; // the client aborted this upload at the end of the test
      }
      upload = Buffer.concat(chunks);
    }

    const out = await forward(req.method, req.url, upload);
    res.writeHead(out.status, { 'Content-Type': out.headers['content-type'] });
    res.flushHeaders(); // headers go out at once, as from a real server
    if (req.method === 'GET' && out.body.length > 10000) {
      await writePaced(res, out.body, gen);
    } else {
      res.end(out.body);
    }
  });
}

function report(name: string, known: string, measured: string) {
  rows.push(`${name.padEnd(44)} known ${known.padEnd(14)} measured ${measured}`);
}

const errorPct = (measured: number, known: number) => (Math.abs(measured - known) / known) * 100;

beforeAll(async () => {
  (globalThis as any).XMLHttpRequest = NodeXHR;
  const serverDir = path.resolve(__dirname, '../../server');
  server = spawn('node', ['-r', path.resolve(__dirname, 'stubDb.js'), 'server.js'], {
    cwd: serverDir,
    env: { ...process.env, PORT: String(SERVER_PORT) },
    stdio: 'ignore',
  });
  proxy = startProxy();
  await new Promise<void>(resolve => proxy.listen(PROXY_PORT, '127.0.0.1', () => resolve()));
  for (let i = 0; i < 50; i++) {
    const ok = await fetch(`http://127.0.0.1:${SERVER_PORT}/ping`).then(r => r.ok, () => false);
    if (ok) return;
    await sleep(100);
  }
  throw new Error('server did not start');
}, 15000);

afterAll(async () => {
  server?.kill();
  proxy?.closeAllConnections?.();
  await new Promise<void>(resolve => proxy.close(() => resolve()));
  // eslint-disable-next-line no-console
  console.log('\nMEASURED vs KNOWN\n' + rows.join('\n') + '\n');
});

beforeEach(() => {
  pingCount = 0;
  linkFreeAt = 0;
  generation++;
});

// Request 0 is the warm-up that opens the connection; it is not counted
describe('latency, jitter and failed requests', () => {
  it('latency is the median round trip and jitter the average change between pings', async () => {
    link = { mbps: 100, delayMs: 0, pingDelays: [0, 30, 50, 40, 60, 20, 30, 50, 40, 60, 20] };
    const res = await speedTester.measureLatencyAndJitter(LINK);
    report('Latency (10 pings, 20-60 ms)', '40 ms', `${res.latency} ms`);
    report('Jitter (same pings)', '21.1 ms', `${res.jitter} ms`);
    report('Packet loss, nothing failing', '0%', `${res.packetLoss}%`);
    expect(res.latency).toBeGreaterThanOrEqual(40);
    expect(res.latency).toBeLessThan(50);
    expect(Math.abs((res.jitter as number) - 21.1)).toBeLessThan(5);
    expect(res.packetLoss).toBe(0);
  }, 15000);

  it('2 failed requests out of 10 report 20%', async () => {
    link = { mbps: 100, delayMs: 5, failPings: [2, 6] };
    const res = await speedTester.measureLatencyAndJitter(LINK);
    report('Packet loss, 2 of 10 requests failing', '20%', `${res.packetLoss}%`);
    expect(res.packetLoss).toBe(20);
  }, 15000);

  it('all requests failing reports 100% and no invented latency', async () => {
    link = { mbps: 100, delayMs: 0, failPings: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] };
    const res = await speedTester.measureLatencyAndJitter(LINK);
    report('All requests failing', '100%, no ms', `${res.packetLoss}%, latency ${res.latency}`);
    expect(res).toEqual({ latency: null, jitter: null, packetLoss: 100 });
  }, 15000);
});

// Each test runs the real 8 s, 4-connection measurement, stopping early at the data cap
describe('download', () => {
  it.each([
    [5, 0],
    [10, 0],
    [25, 0],
    [50, 0],
    [10, 50],
    [50, 50],
    [100, 50],
    [200, 50],
  ])('%i Mbps link, %i ms delay', async (known, delayMs) => {
    link = { mbps: known, delayMs };
    const measured = (await speedTester.measureDownload(LINK)) as number;
    report(`Download, ${delayMs} ms delay`, `${known} Mbps`, `${measured} Mbps (${errorPct(measured, known).toFixed(1)}% off)`);
    expect(errorPct(measured, known)).toBeLessThan(10);
  }, 30000);

  it('download failure gives no speed', async () => {
    const measured = await speedTester.measureDownload('http://127.0.0.1:1');
    report('Download, server unreachable', 'no value', String(measured));
    expect(measured).toBeNull();
  }, 15000);
});

describe('upload', () => {
  it.each([
    [2, 0],
    [5, 0],
    [10, 0],
    [20, 0],
    [20, 50],
    [50, 50],
  ])('%i Mbps link, %i ms delay', async (known, delayMs) => {
    link = { mbps: known, delayMs };
    const measured = (await speedTester.measureUpload(LINK)) as number;
    report(`Upload, ${delayMs} ms delay`, `${known} Mbps`, `${measured} Mbps (${errorPct(measured, known).toFixed(1)}% off)`);
    expect(errorPct(measured, known)).toBeLessThan(10);
  }, 30000);

  it('upload failure gives no speed', async () => {
    const measured = await speedTester.measureUpload('http://127.0.0.1:1');
    report('Upload, server unreachable', 'no value', String(measured));
    expect(measured).toBeNull();
  }, 15000);
});

describe('video and web', () => {
  it('video delay, throughput and quality', async () => {
    link = { mbps: 10, delayMs: 100 };
    const res = await measureVideo(LINK);
    report('Video start delay', '100 ms', `${res.videoDelayMs} ms`);
    report('Video speed (10 Mbps link, 100 ms delay)', '10 Mbps', `${res.videoMbps} Mbps`);
    report('Streaming quality for that speed', qualityForMbps(10), String(res.streamingQuality));
    expect(res.videoDelayMs).toBeGreaterThanOrEqual(100);
    expect(res.videoDelayMs).toBeLessThan(160);
    expect(errorPct(res.videoMbps as number, 10)).toBeLessThan(10);
    expect(res.streamingQuality).toBe(qualityForMbps(res.videoMbps as number));
  }, 20000);

  it('web page first byte and load time', async () => {
    link = { mbps: 10, delayMs: 80 };
    const res = await measureWeb(LINK);
    report('Web page first byte (TTFB)', '80 ms', `${res.ttfbMs} ms`);
    report('Web page load', '0.08 s', `${res.pageLoadSec} s`);
    expect(res.ttfbMs).toBeGreaterThanOrEqual(80);
    expect(res.ttfbMs).toBeLessThan(130);
  }, 15000);
});
