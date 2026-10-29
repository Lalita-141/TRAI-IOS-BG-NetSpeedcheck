const mockStorage: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => (k in mockStorage ? mockStorage[k] : null)),
  setItem: jest.fn(async (k: string, v: string) => {
    mockStorage[k] = v;
  }),
  removeItem: jest.fn(async (k: string) => {
    delete mockStorage[k];
  }),
}));
jest.mock('../src/config', () => ({
  getConfig: jest.fn(async () => ({ serverUrl: 'http://server', batchSize: 20 })),
  getDeviceId: jest.fn(async () => 'device-1'),
}));

import { Sample } from '../src/types';

const sample = (id: string, ts: number): Sample => ({
  id,
  device_id: 'device-1',
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

// Fresh module instances (in-memory caches) per test
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

const ok = (body: any) => ({ ok: true, status: 200, json: async () => body });

beforeEach(() => {
  Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
  (globalThis as any).fetch = jest.fn();
});

describe('history store', () => {
  it('shows a new test immediately as pending, and keeps it after upload', async () => {
    const { sampleStore } = load();
    await sampleStore.add(sample('a', 100));

    let history = await sampleStore.getHistory();
    expect(history.map((s: Sample) => [s.id, s.is_pending])).toEqual([['a', true]]);

    await sampleStore.remove(['a']); // uploader acknowledged it
    history = await sampleStore.getHistory();
    expect(history.map((s: Sample) => [s.id, s.is_pending])).toEqual([['a', false]]);
    expect(await sampleStore.getPendingCount()).toBe(0);
  });

  it('merges pending + server snapshot newest-first without duplicates', async () => {
    const { sampleStore } = load();
    await sampleStore.saveServerSnapshot([sample('s2', 200), sample('s1', 100)]);
    await sampleStore.add(sample('p3', 300));
    await sampleStore.add(sample('s2', 200)); // also on server

    const history = await sampleStore.getHistory();
    expect(history.map((s: Sample) => s.id)).toEqual(['p3', 's2', 's1']);
    expect(await sampleStore.getCapacityInfo()).toMatchObject({ count: 3 });
  });

  it('keeps existing local history (old storage key) as the offline cache', async () => {
    mockStorage['@speedmonitor_history_samples'] = JSON.stringify([sample('old', 50)]);
    const { sampleStore } = load();
    expect((await sampleStore.getHistory()).map((s: Sample) => s.id)).toEqual(['old']);
  });

  it('never stores the UI is_pending flag', async () => {
    const { sampleStore } = load();
    await sampleStore.add({ ...sample('a', 1), is_pending: true });
    expect(mockStorage['@speedmonitor_pending_samples']).not.toContain('is_pending');
  });
});

describe('syncHistoryFromServer', () => {
  it('online: uploads pending, then replaces the cache with server history', async () => {
    const { sampleStore, uploader } = load();
    await sampleStore.add(sample('local', 300));
    ((globalThis as any).fetch as jest.Mock)
      .mockResolvedValueOnce(ok({ accepted: 1 })) // POST /v1/speed-samples
      .mockResolvedValueOnce(ok({ samples: [sample('local', 300), sample('native-bg', 200)] }));

    const res = await uploader.syncHistoryFromServer(true);
    expect(res).toMatchObject({ success: true, count: 2 });
    expect(((globalThis as any).fetch as jest.Mock).mock.calls[1][0]).toBe(
      'http://server/v1/devices/device-1/history?limit=500'
    );
    const history = await sampleStore.getHistory();
    expect(history.map((s: Sample) => [s.id, s.is_pending])).toEqual([
      ['local', false],
      ['native-bg', false],
    ]);
  });

  it('offline: keeps the cached history and pending samples', async () => {
    const { sampleStore, uploader } = load();
    await sampleStore.saveServerSnapshot([sample('cached', 100)]);
    await sampleStore.add(sample('unsent', 200));
    ((globalThis as any).fetch as jest.Mock).mockRejectedValue(new Error('Network request failed'));

    const res = await uploader.syncHistoryFromServer(true);
    expect(res.success).toBe(false);
    const history = await sampleStore.getHistory();
    expect(history.map((s: Sample) => [s.id, s.is_pending])).toEqual([
      ['unsent', true],
      ['cached', false],
    ]);
  });

  it('throttles repeated non-forced syncs', async () => {
    const { uploader } = load();
    ((globalThis as any).fetch as jest.Mock).mockResolvedValue(ok({ samples: [] }));
    await uploader.syncHistoryFromServer();
    const second = await uploader.syncHistoryFromServer();
    expect(second.skipped).toBe(true);
  });
});
