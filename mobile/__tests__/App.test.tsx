/**
 * @format
 * Smoke test: the whole app starts and shows its main screen without crashing.
 * Native modules are replaced with simple fakes; no network or device features are used.
 */
const mockStorage: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockStorage[k] ?? null),
    setItem: jest.fn(async (k: string, v: string) => {
      mockStorage[k] = v;
    }),
    removeItem: jest.fn(async (k: string) => {
      delete mockStorage[k];
    }),
    multiRemove: jest.fn(async () => {}),
    getAllKeys: jest.fn(async () => Object.keys(mockStorage)),
  },
}));
jest.mock('@react-native-community/netinfo', () => {
  const state = { type: 'wifi', isConnected: true, isInternetReachable: true, details: {} };
  return {
    __esModule: true,
    default: { fetch: jest.fn(async () => state), addEventListener: jest.fn(() => () => {}) },
    fetch: jest.fn(async () => state),
    addEventListener: jest.fn(() => () => {}),
    NetInfoStateType: { wifi: 'wifi', cellular: 'cellular', none: 'none', unknown: 'unknown' },
  };
});
jest.mock('@react-native-community/geolocation', () => ({
  __esModule: true,
  default: {
    getCurrentPosition: jest.fn((_ok: any, fail: any) => fail?.({ code: 2, message: 'no location in tests' })),
    watchPosition: jest.fn(() => 1),
    clearWatch: jest.fn(),
    requestAuthorization: jest.fn((ok: any) => ok?.()),
    setRNConfiguration: jest.fn(),
  },
}));
jest.mock('react-native-webview', () => {
  const ReactLib = require('react');
  const WebView = ReactLib.forwardRef((props: any, _ref: any) => ReactLib.createElement('WebView', props));
  return { __esModule: true, WebView, default: WebView };
});
jest.mock('react-native-svg', () => {
  const ReactLib = require('react');
  const svg = (name: string) => (props: any) => ReactLib.createElement(name, props, props.children);
  const names = ['Svg', 'Circle', 'Path', 'Rect', 'G', 'Line', 'Polyline', 'Polygon', 'Ellipse', 'Defs', 'LinearGradient', 'RadialGradient', 'Stop', 'ClipPath', 'Mask'];
  const mod: any = { __esModule: true, default: svg('Svg'), Text: svg('SvgText') };
  names.forEach(n => (mod[n] = svg(n)));
  return mod;
});

import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import App from '../App';

beforeEach(() => {
  jest.useFakeTimers();
  (globalThis as any).fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('renders correctly', async () => {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = ReactTestRenderer.create(<App />);
  });
  // Let the splash screen finish and the start-up work settle
  await act(async () => {
    await jest.advanceTimersByTimeAsync(5000);
  });
  const text = tree.root
    .findAllByType(Text)
    .map(t => [].concat(t.props.children).filter(c => typeof c === 'string').join(''))
    .join('\n');
  expect(text).toContain('NetSpeed Monitor');
  await act(async () => {
    tree.unmount();
  });
});
