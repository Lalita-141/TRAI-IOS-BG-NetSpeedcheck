/**
 * Offline queue and server calls (src/services/sampleStore.ts, src/services/uploader.ts).
 */
const mockStorage: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockStorage[k] ?? null),
  setItem: jest.fn(async (k: string, v: string) => {
    mockStorage[k] = v;
  }),
  removeItem: jest.fn(async (k: string) => {
    delete mockStorage[k];
  }),
}));
jest.mock('../src/config', () => ({
  getConfig: jest.fn(async () => ({ serverUrl: 'https://server.example.com/', batchSize: 2 })),
  getDeviceId: jest.fn(async () => 'device 1'),
}));

import { Sample } from '../src/types';

const sample = (id: string, ts: number): Sample => ({
  id,
  device_id: 'device 1',
  ts,
  down_mbps: 10,
  up_mbps: 5,
  latency_ms: 20,
  jitter_ms: 1,
  packet_loss_pct: 0,
  network: 'wifi',
  radio: 'Wi-Fi',
  carrier: 'Jio',
  lat: null,
  lng: null,
  accuracy: null,
});

const load = () => {
  let mods: { sampleStore: any; uploader: any } = {} as any;
  jest.isolateModules(() => {
    mods = {
      sampleStore: require('../src/services/sampleStore').sampleStore,
      uploader: require('../src/services/uploader').uploader,
    };
  });
  return mods;
};

const reply = (status: number, body: any = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const fetchMock = () => (globalThis as any).fetch as jest.Mock;

beforeEach(() => {
  Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
  (globalThis as any).fetch = jest.fn(async () => reply(200, {}));
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('upload queue (flush)', () => {
  it('uploads every pending test in batches and empties the queue', async () => {
    const { sampleStore, uploader } = load();
    for (const id of ['a', 'b', 'c']) await sampleStore.add(sample(id, 1));

    const result = await uploader.flush();
    expect(result).toEqual({ uploadedCount: 3, remainingPending: 0, success: true });
    expect(fetchMock()).toHaveBeenCalledTimes(2); // batch size 2
    const [url, init] = fetchMock().mock.calls[0];
    expect(url).toBe('https://server.example.com/v1/speed-samples');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body).samples.map((s: Sample) => s.id)).toEqual(['a', 'b']);
    expect(await sampleStore.getPendingCount()).toBe(0);
  });

  it('keeps tests in the queue when the server rejects them', async () => {
    const { sampleStore, uploader } = load();
    await sampleStore.add(sample('a', 1));
    fetchMock().mockResolvedValue(reply(500));
    const result = await uploader.flush();
    expect(result).toMatchObject({ success: false, uploadedCount: 0, remainingPending: 1, error: 'HTTP 500: Upload rejected by server' });
  });

  it('keeps tests in the queue when offline', async () => {
    const { sampleStore, uploader } = load();
    await sampleStore.add(sample('a', 1));
    fetchMock().mockRejectedValue(new Error('Network request failed'));
    const result = await uploader.flush();
    expect(result).toMatchObject({ success: false, remainingPending: 1, error: 'Network request failed' });
  });

  it('keeps what was uploaded when a later batch fails', async () => {
    const { sampleStore, uploader } = load();
    for (const id of ['a', 'b', 'c']) await sampleStore.add(sample(id, 1));
    fetchMock().mockResolvedValueOnce(reply(200)).mockRejectedValueOnce(new Error('dropped'));
    const result = await uploader.flush();
    expect(result).toMatchObject({ success: false, uploadedCount: 2, remainingPending: 1 });
    expect((await sampleStore.getPending()).map((s: Sample) => s.id)).toEqual(['c']);
  });

  it('does not upload the same tests twice when called again while busy', async () => {
    const { sampleStore, uploader } = load();
    await sampleStore.add(sample('a', 1));
    let respond!: (v: any) => void;
    fetchMock().mockReturnValueOnce(new Promise(r => (respond = r)));
    const first = uploader.flush();
    const second = await uploader.flush();
    expect(second).toEqual({ uploadedCount: 0, remainingPending: 1, success: true });
    respond(reply(200));
    expect((await first).uploadedCount).toBe(1);
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the queue is empty', async () => {
    const { uploader } = load();
    expect(await uploader.flush()).toEqual({ uploadedCount: 0, remainingPending: 0, success: true });
    expect(fetchMock()).not.toHaveBeenCalled();
  });
});

describe('history store limits', () => {
  it('keeps only the newest 500 unsent tests after a long time offline', async () => {
    const { sampleStore } = load();
    for (let i = 0; i < 503; i++) await sampleStore.add(sample(`s${i}`, i));
    expect(await sampleStore.getPendingCount()).toBe(500);
    expect((await sampleStore.getPending(1))[0].id).toBe('s3');
  });

  it('getHistory(limit) returns the newest tests first', async () => {
    const { sampleStore } = load();
    for (const [id, ts] of [['old', 1], ['new', 3], ['mid', 2]] as const) await sampleStore.add(sample(id, ts));
    expect((await sampleStore.getHistory(2)).map((s: Sample) => s.id)).toEqual(['new', 'mid']);
  });

  it('reports how full the history is', async () => {
    const { sampleStore } = load();
    await sampleStore.saveServerSnapshot(Array.from({ length: 125 }, (_, i) => sample(`s${i}`, i)));
    expect(await sampleStore.getCapacityInfo()).toEqual({ count: 125, maxLimit: 500, isFull: false, usagePercent: 25 });
  });

  it('clearAll removes everything', async () => {
    const { sampleStore } = load();
    await sampleStore.add(sample('p', 2));
    await sampleStore.saveServerSnapshot([sample('s', 1)]);
    await sampleStore.clearAll();
    expect(await sampleStore.getHistory()).toEqual([]);
    expect(await sampleStore.getPendingCount()).toBe(0);
  });
});

describe('server calls', () => {
  it('deleting server data also clears the cached history but keeps unsent tests', async () => {
    const { sampleStore, uploader } = load();
    await sampleStore.saveServerSnapshot([sample('synced', 1)]);
    await sampleStore.add(sample('unsent', 2));
    fetchMock().mockResolvedValue(reply(200, { deleted_count: 7 }));

    expect(await uploader.deleteServerRecordsForDevice('device 1')).toEqual({ success: true, count: 7 });
    const [url, init] = fetchMock().mock.calls[0];
    expect(url).toBe('https://server.example.com/v1/speed-samples/device/device%201');
    expect(init.method).toBe('DELETE');
    expect((await sampleStore.getHistory()).map((s: Sample) => s.id)).toEqual(['unsent']);
  });

  it('a failed delete keeps the local history', async () => {
    const { sampleStore, uploader } = load();
    await sampleStore.saveServerSnapshot([sample('synced', 1)]);
    fetchMock().mockResolvedValue(reply(403));
    expect(await uploader.deleteServerRecordsForDevice('device 1')).toEqual({
      success: false,
      error: 'Server responded with HTTP 403',
    });
    expect(await sampleStore.getHistory()).toHaveLength(1);
  });

  it('sends feedback with the device, rating and location', async () => {
    const { uploader } = load();
    fetchMock().mockResolvedValue(reply(201, { id: 'fb-1' }));
    const result = await uploader.submitFeedback({
      deviceId: 'device 1',
      carrier: 'Airtel',
      rating: 4,
      category: 'Coverage',
      comment: 'Weak indoors',
      lat: 12.9,
      lng: 77.6,
    });
    expect(result).toEqual({ success: true, id: 'fb-1' });
    const [url, init] = fetchMock().mock.calls[0];
    expect(url).toBe('https://server.example.com/v1/feedback');
    expect(JSON.parse(init.body)).toEqual({
      device_id: 'device 1',
      carrier: 'Airtel',
      rating: 4,
      category: 'Coverage',
      comment: 'Weak indoors',
      lat: 12.9,
      lng: 77.6,
    });
  });

  it('reports a feedback failure', async () => {
    const { uploader } = load();
    fetchMock().mockRejectedValue(new Error('offline'));
    expect(await uploader.submitFeedback({ deviceId: 'd', rating: 1 })).toEqual({ success: false, error: 'offline' });
  });

  it('asks for nearby coverage around a location', async () => {
    const { uploader } = load();
    fetchMock().mockResolvedValue(reply(200, { operators: [] }));
    expect(await uploader.fetchNearbyCoverage(19.07, 72.87)).toEqual({ success: true, data: { operators: [] } });
    expect(fetchMock().mock.calls[0][0]).toBe(
      'https://server.example.com/v1/coverage/nearby?lat=19.07&lng=72.87&radius_km=5'
    );
  });

  it('fetches the remote app config', async () => {
    const { uploader } = load();
    fetchMock().mockResolvedValue(reply(200, { minVersion: '1.0' }));
    expect(await uploader.fetchRemoteConfig()).toEqual({ success: true, config: { minVersion: '1.0' } });
    fetchMock().mockResolvedValue(reply(502));
    expect((await uploader.fetchRemoteConfig()).success).toBe(false);
  });

  it('fetchDeviceHistory returns an empty list when the server has none', async () => {
    const { uploader } = load();
    fetchMock().mockResolvedValue(reply(200, {}));
    expect(await uploader.fetchDeviceHistory('device 1', 50)).toEqual({ success: true, samples: [] });
    expect(fetchMock().mock.calls[0][0]).toBe('https://server.example.com/v1/devices/device%201/history?limit=50');
  });

  it('two history syncs at the same time share one request', async () => {
    const { uploader } = load();
    fetchMock().mockResolvedValue(reply(200, { samples: [] }));
    const [a, b] = await Promise.all([uploader.syncHistoryFromServer(true), uploader.syncHistoryFromServer(true)]);
    expect(a).toBe(b);
    expect(fetchMock().mock.calls.filter(c => String(c[0]).includes('/history'))).toHaveLength(1);
  });
});
