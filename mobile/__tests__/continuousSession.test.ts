/**
 * Continuous test sessions (src/services/continuousTestService.ts): repeated cycles with a gap,
 * live state, the end-of-session summary, stopping, and failed cycles. Network results are mocked.
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
jest.mock('@react-native-community/netinfo', () => ({ fetch: jest.fn(), NetInfoStateType: {} }));
jest.mock('@react-native-community/geolocation', () => ({}));
jest.mock('../src/config', () => ({
  getConfig: jest.fn(async () => ({ serverUrl: 'https://speed.example.com', wifiOnly: false, testLabel: 'Home' })),
  getDeviceId: jest.fn(async () => 'device-1'),
}));
jest.mock('../src/services/speedTester', () => ({
  speedTester: { runFullTest: jest.fn(), getNetworkContext: jest.fn(), measureLatencyAndJitter: jest.fn() },
}));
jest.mock('../src/services/qosProbes', () => ({
  measureVideoAndWeb: jest.fn(),
  qualityForMbps: jest.requireActual('../src/services/qosProbes').qualityForMbps,
}));
jest.mock('../src/services/sampleStore', () => ({ sampleStore: { add: jest.fn(async () => {}) } }));
jest.mock('../src/services/uploader', () => ({ uploader: { flush: jest.fn(async () => ({ success: true })) } }));
jest.mock('../src/services/locationService', () => ({
  locationService: {
    getCurrentLocation: jest.fn(async () => ({ lat: 22.5, lng: 88.3, accuracy: 6.4 })),
    requestPermission: jest.fn(async () => true),
    watchPosition: jest.fn(() => 7),
    clearWatch: jest.fn(),
  },
}));
jest.mock('../src/services/backgroundKeepAlive', () => ({
  backgroundKeepAlive: { acquire: jest.fn(), release: jest.fn() },
}));
jest.mock('../src/services/locationPermission', () => ({ promptForBackgroundLocation: jest.fn(async () => {}) }));

const speedResult = (down: number | null, up: number, latency: number) => ({
  latency,
  jitter: 2,
  packetLoss: 0,
  downMbps: down,
  upMbps: up,
  networkType: 'cellular',
  radioTech: '4G / LTE',
  carrier: 'Airtel',
  signal: { signal_dbm: null, signal_quality: null, cell_tower: null, frequency_band: null },
});

function load() {
  let app: any;
  jest.isolateModules(() => {
    app = {
      service: require('../src/services/continuousTestService').continuousTestService,
      speedTester: require('../src/services/speedTester').speedTester,
      probes: require('../src/services/qosProbes'),
      sampleStore: require('../src/services/sampleStore').sampleStore,
      keepAlive: require('../src/services/backgroundKeepAlive').backgroundKeepAlive,
      location: require('../src/services/locationService').locationService,
    };
  });
  return app;
}

const advance = (ms: number) => jest.advanceTimersByTimeAsync(ms);

beforeEach(() => {
  jest.useFakeTimers({ now: new Date(2026, 10, 16, 10, 0).getTime() });
  Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('speed session', () => {
  it('runs a cycle every gap until the time is up, then summarises', async () => {
    const { service, speedTester, sampleStore } = load();
    const downs = [10, 20, 30, 40, 50, 60];
    speedTester.runFullTest.mockImplementation(async () => {
      const down = downs.shift() as number;
      return speedResult(down, down / 2, 20 + down / 10);
    });

    await service.start({ testType: 'speed', gapSeconds: 10, durationMins: 1 });
    await advance(61_000);

    const state = service.getState();
    expect(state.active).toBe(false);
    expect(state.cycles).toHaveLength(6); // at 0, 10, 20, 30, 40, 50 s
    expect(state.cycles[0].cycleNumber).toBe(6); // newest first
    const results = state.lastResults;
    expect(results).toMatchObject({
      testType: 'speed',
      totalCyclesCompleted: 6,
      stoppedByUser: false,
      totalSecondsElapsed: 60,
    });
    expect(results.summary).toEqual({
      stat1Label: 'Avg Download',
      stat1Value: '35.0 Mbps',
      stat2Label: 'Peak Download',
      stat2Value: '60.0 Mbps',
      stat3Label: 'Avg Upload',
      stat3Value: '17.5 Mbps',
      stat4Label: 'Avg Latency',
      stat4Value: '24 ms',
    });
    expect(sampleStore.add).toHaveBeenCalledTimes(6);
    // Each cycle keeps the full result it saved, for the results screen
    expect(state.cycles[5].sample).toBe(sampleStore.add.mock.calls[0][0]);
    expect(state.cycles[0].sample).toMatchObject({ down_mbps: 60, up_mbps: 30, latency_ms: 26, jitter_ms: 2 });
    expect(sampleStore.add.mock.calls[0][0]).toMatchObject({
      test_type: 'continuous',
      down_mbps: 10,
      location_type: 'Home',
      lat: 22.5,
    });
  });

  it('enforces a gap of at least 3 seconds', async () => {
    const { service, speedTester } = load();
    speedTester.runFullTest.mockResolvedValue(speedResult(10, 5, 20));
    await service.start({ testType: 'speed', gapSeconds: 0, durationMins: 0.25 }); // 15 s
    await advance(16_000);
    expect(speedTester.runFullTest).toHaveBeenCalledTimes(5); // at 0, 3, 6, 9, 12 s
  });

  it('a failed cycle is shown as failed and left out of the averages', async () => {
    const { service, speedTester, sampleStore } = load();
    speedTester.runFullTest
      .mockResolvedValueOnce(speedResult(40, 10, 30))
      .mockRejectedValueOnce(new Error('No internet connection'))
      .mockResolvedValue(speedResult(20, 10, 30));
    await service.start({ testType: 'speed', gapSeconds: 10, durationMins: 0.5 });
    await advance(31_000);

    const { cycles, lastResults } = service.getState();
    const failed = cycles.find((c: any) => c.failed);
    expect(failed).toMatchObject({ cycleNumber: 2, primaryMetric: 'Failed', extraInfo: 'No internet connection' });
    expect(failed.sample).toBeNull();
    expect(lastResults.summary.stat1Value).toBe('30.0 Mbps');
    expect(sampleStore.add).toHaveBeenCalledTimes(2);
  });

  it('a cycle with no download result counts as failed', async () => {
    const { service, speedTester } = load();
    speedTester.runFullTest.mockResolvedValue(speedResult(null, 3, 50));
    await service.start({ testType: 'speed', gapSeconds: 10, durationMins: 0.2 });
    await advance(13_000);
    expect(service.getState().cycles[0].failed).toBe(true);
    expect(service.getState().lastResults.summary.stat1Value).toBe('--');
  });

  it('stop ends the session straight away and marks it as stopped by the user', async () => {
    const { service, speedTester, keepAlive, location } = load();
    speedTester.runFullTest.mockResolvedValue(speedResult(10, 5, 20));
    await service.start({ testType: 'speed', gapSeconds: 10, durationMins: 5 });
    await advance(25_000);
    const results = await service.stop();
    expect(results).toMatchObject({ stoppedByUser: true, totalCyclesCompleted: 3, totalSecondsElapsed: 25 });

    await advance(60_000);
    expect(speedTester.runFullTest).toHaveBeenCalledTimes(3); // nothing after stop
    expect(keepAlive.release).toHaveBeenCalledWith('continuous');
    expect(location.clearWatch).toHaveBeenCalledWith(7);
    expect(mockStorage['@speedmonitor_continuous_session']).toBeUndefined();
  });

  it('saves the running session so it can resume after the app is killed', async () => {
    const { service, speedTester, keepAlive } = load();
    speedTester.runFullTest.mockResolvedValue(speedResult(10, 5, 20));
    await service.start({ testType: 'speed', gapSeconds: 10, durationMins: 5 });
    await advance(1_000);
    const saved = JSON.parse(mockStorage['@speedmonitor_continuous_session']);
    expect(saved).toMatchObject({ config: { testType: 'speed', durationMins: 5 }, currentCycle: 1 });
    expect(keepAlive.acquire).toHaveBeenCalledWith('continuous', { relaunchAfterKill: true });
    await service.stop();
  });

  it('marks results as unseen until the user opens them', async () => {
    const { service, speedTester } = load();
    speedTester.runFullTest.mockResolvedValue(speedResult(10, 5, 20));
    await service.start({ testType: 'speed', gapSeconds: 10, durationMins: 0.2 });
    await advance(13_000);
    expect(service.getState().resultsSeen).toBe(false);
    service.markResultsSeen();
    expect(service.getState().resultsSeen).toBe(true);
  });
});

describe('coverage session', () => {
  it('records network, latency and connectivity for each cycle', async () => {
    const { service, speedTester } = load();
    speedTester.getNetworkContext.mockResolvedValue({
      network: 'cellular',
      radio: '5G',
      carrier: 'Jio',
      isConnected: true,
      signal: { signal_dbm: null, signal_quality: null, cell_tower: null, frequency_band: null },
    });
    speedTester.measureLatencyAndJitter
      .mockResolvedValueOnce({ latency: 30, jitter: 1, packetLoss: 0 })
      .mockResolvedValueOnce({ latency: null, jitter: null, packetLoss: 100 })
      .mockResolvedValue({ latency: 50, jitter: 1, packetLoss: 10 });
    await service.start({ testType: 'coverage', gapSeconds: 10, durationMins: 0.5 });
    await advance(31_000);

    const { cycles, lastResults } = service.getState();
    expect(cycles.map((c: any) => c.primaryMetric).reverse()).toEqual(['5G', 'No Service', '5G']);
    expect(cycles[0].extraInfo).toBe('Jio • Loss 10% • GPS ±6m');
    expect(lastResults.summary).toMatchObject({
      stat1Value: '40 ms',
      stat2Value: '67%',
      stat3Value: 'Jio',
      stat4Value: '5G',
    });
  });
});

describe('video & browsing session', () => {
  it('records load time, stream quality and video start for each cycle', async () => {
    const { service, speedTester, probes, sampleStore } = load();
    speedTester.getNetworkContext.mockResolvedValue({
      network: 'wifi',
      radio: 'Wi-Fi',
      carrier: 'ACT Fibernet',
      isConnected: true,
      signal: { signal_dbm: null, signal_quality: null, cell_tower: null, frequency_band: null },
    });
    probes.measureVideoAndWeb.mockResolvedValue({
      videoDelayMs: 300,
      videoMbps: 12,
      streamingQuality: '1080p Full HD',
      ttfbMs: 120,
      pageLoadSec: 1.25,
    });
    await service.start({ testType: 'video_browser', gapSeconds: 10, durationMins: 0.2 });
    await advance(13_000);

    const { cycles, lastResults } = service.getState();
    expect(cycles[0]).toMatchObject({ primaryMetric: '1.25s', secondaryMetric: '1080p Full HD', failed: false });
    expect(lastResults.summary).toMatchObject({
      stat1Value: '1.25s',
      stat2Value: '1080p Full HD',
      stat3Value: '300 ms',
      stat4Value: '12.0 Mbps',
    });
    expect(sampleStore.add.mock.calls[0][0]).toMatchObject({
      video_delay_ms: 300,
      web_delay_ms: 1250,
      page_load_sec: 1.25,
      ttfb_ms: 120,
      streaming_quality: '1080p Full HD',
    });
  });

  it('saves nothing for a cycle where both probes failed', async () => {
    const { service, speedTester, probes, sampleStore } = load();
    speedTester.getNetworkContext.mockResolvedValue({ network: 'wifi', radio: 'Wi-Fi', carrier: null, isConnected: true, signal: {} });
    probes.measureVideoAndWeb.mockResolvedValue({
      videoDelayMs: null,
      videoMbps: null,
      streamingQuality: null,
      ttfbMs: null,
      pageLoadSec: null,
    });
    await service.start({ testType: 'video_browser', gapSeconds: 10, durationMins: 0.2 });
    await advance(13_000);
    expect(service.getState().cycles[0].failed).toBe(true);
    expect(sampleStore.add).not.toHaveBeenCalled();
  });

  it('fails a cycle when offline instead of saving invented values', async () => {
    const { service, speedTester, probes } = load();
    speedTester.getNetworkContext.mockResolvedValue({ network: 'none', isConnected: false, signal: {} });
    await service.start({ testType: 'video_browser', gapSeconds: 10, durationMins: 0.2 });
    await advance(13_000);
    expect(service.getState().cycles[0]).toMatchObject({ failed: true, extraInfo: 'No internet connection' });
    expect(probes.measureVideoAndWeb).not.toHaveBeenCalled();
  });
});
