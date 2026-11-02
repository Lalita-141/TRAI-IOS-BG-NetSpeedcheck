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

/** Sends a body at exactly link.mbps. */
async function writePaced(res: any, body: any) {
  const bytesPerMs = (link.mbps * 1_000_000) / 8 / 1000;
  const start = Date.now();
  let sent = 0;
  while (sent < body.length) {
    const target = Math.min(body.length, Math.floor((Date.now() - start) * bytesPerMs));
    if (target > sent) {
      res.write(body.subarray(sent, target));
      sent = target;
    }
    await sleep(2);
  }
  res.end();
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

    let upload;
    if (req.method === 'POST') {
      // Receives the upload at exactly link.mbps
      const bytesPerMs = (link.mbps * 1_000_000) / 8 / 1000;
      const start = Date.now();
      const chunks: any[] = [];
      let total = 0;
      for await (const chunk of req) {
        chunks.push(chunk);
        total += chunk.length;
        while ((Date.now() - start) * bytesPerMs < total) await sleep(2);
      }
      upload = Buffer.concat(chunks);
    }

    const out = await forward(req.method, req.url, upload);
    res.writeHead(out.status, { 'Content-Type': out.headers['content-type'] });
    if (req.method === 'GET' && out.body.length > 10000) {
      await writePaced(res, out.body);
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
});

describe('latency, jitter and failed requests', () => {
  it('latency is the median round trip and jitter the average change between pings', async () => {
    link = { mbps: 100, delayMs: 0, pingDelays: [30, 50, 40, 60, 20] };
    const res = await speedTester.measureLatencyAndJitter(LINK);
    report('Latency (delays 30,50,40,60,20 ms)', '40 ms', `${res.latency} ms`);
    report('Jitter (same pings)', '22.5 ms', `${res.jitter} ms`);
    report('Packet loss, nothing failing', '0%', `${res.packetLoss}%`);
    expect(res.latency).toBeGreaterThanOrEqual(40);
    expect(res.latency).toBeLessThan(55);
    expect(Math.abs((res.jitter as number) - 22.5)).toBeLessThan(10);
    expect(res.packetLoss).toBe(0);
  }, 15000);

  it('2 failed requests out of 5 report 40%', async () => {
    link = { mbps: 100, delayMs: 5, failPings: [1, 3] };
    const res = await speedTester.measureLatencyAndJitter(LINK);
    report('Packet loss, 2 of 5 requests failing', '40%', `${res.packetLoss}%`);
    expect(res.packetLoss).toBe(40);
  }, 15000);

  it('all requests failing reports 100% and no invented latency', async () => {
    link = { mbps: 100, delayMs: 0, failPings: [0, 1, 2, 3, 4] };
    const res = await speedTester.measureLatencyAndJitter(LINK);
    report('All requests failing', '100%, no ms', `${res.packetLoss}%, latency ${res.latency}`);
    expect(res).toEqual({ latency: null, jitter: null, packetLoss: 100 });
  }, 15000);
});

describe('download', () => {
  it.each([5, 10, 25, 50])('%i Mbps link, no delay', async known => {
    link = { mbps: known, delayMs: 0 };
    const measured = (await speedTester.measureDownload(LINK, 2)) as number;
    report(`Download 2 MB, no delay`, `${known} Mbps`, `${measured} Mbps (${errorPct(measured, known).toFixed(1)}% off)`);
    expect(errorPct(measured, known)).toBeLessThan(10);
  }, 20000);

  // Shows the known limit of a small payload: the delay is counted inside the transfer time
  it.each([
    [10, 50],
    [50, 50],
    [100, 50],
    [200, 50],
  ])('%i Mbps link, %i ms delay', async (known, delayMs) => {
    link = { mbps: known, delayMs };
    const measured = (await speedTester.measureDownload(LINK, 2)) as number;
    report(`Download 2 MB, ${delayMs} ms delay`, `${known} Mbps`, `${measured} Mbps (${errorPct(measured, known).toFixed(1)}% off)`);
    expect(measured).toBeLessThanOrEqual(known * 1.05);
  }, 20000);

  it('download failure gives no speed', async () => {
    const measured = await speedTester.measureDownload('http://127.0.0.1:1', 2);
    report('Download, server unreachable', 'no value', String(measured));
    expect(measured).toBeNull();
  }, 15000);
});

describe('upload', () => {
  it.each([2, 5, 10, 20])('%i Mbps link, no delay', async known => {
    link = { mbps: known, delayMs: 0 };
    const measured = (await speedTester.measureUpload(LINK, 1)) as number;
    report(`Upload 1 MB, no delay`, `${known} Mbps`, `${measured} Mbps (${errorPct(measured, known).toFixed(1)}% off)`);
    expect(errorPct(measured, known)).toBeLessThan(10);
  }, 20000);

  it('upload failure gives no speed', async () => {
    const measured = await speedTester.measureUpload('http://127.0.0.1:1', 1);
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
    report('Streaming quality for that speed', qualityForMbps(res.videoMbps as number), String(res.streamingQuality));
    expect(res.videoDelayMs).toBeGreaterThanOrEqual(100);
    expect(res.videoDelayMs).toBeLessThan(160);
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
