/**
 * App settings, device ID (src/config) and the language system (src/i18n).
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

import React from 'react';
import { NativeModules, Platform, Text } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { SUPPORTED_LANGUAGES, translations } from '../src/i18n/translations';
import { LanguageProvider, useTranslation } from '../src/i18n';

const CONFIG_KEY = '@speedmonitor_config_v3';
const DEVICE_KEY = '@speedmonitor_device_id';

// Fresh module (and in-memory cache) per test
const loadConfig = (): typeof import('../src/config') => {
  let mod: any;
  jest.isolateModules(() => {
    mod = require('../src/config');
  });
  return mod;
};

beforeEach(() => {
  Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
  delete NativeModules.NativeMonitorBridge;
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('getConfig / saveConfig', () => {
  it('starts with the production server and a 10 s interval', async () => {
    const { getConfig, DEFAULT_CONFIG } = loadConfig();
    const config = await getConfig();
    expect(config).toEqual(DEFAULT_CONFIG);
    expect(config.serverUrl).toBe('https://netspeed.handt.ai');
    expect(config.testIntervalSeconds).toBe(10);
    expect(config.wifiOnly).toBe(false);
  });

  it('keeps saved settings across restarts', async () => {
    await loadConfig().saveConfig({ wifiOnly: true, testLabel: 'Outdoor' });
    const config = await loadConfig().getConfig(); // "restarted" app
    expect(config.wifiOnly).toBe(true);
    expect(config.testLabel).toBe('Outdoor');
    expect(config.serverUrl).toBe('https://netspeed.handt.ai');
  });

  it('fills settings added in a newer version with their defaults', async () => {
    mockStorage[CONFIG_KEY] = JSON.stringify({ wifiOnly: true });
    const config = await loadConfig().getConfig();
    expect(config.wifiOnly).toBe(true);
    expect(config.batchSize).toBe(20);
  });

  it('ignores a corrupted settings file', async () => {
    mockStorage[CONFIG_KEY] = '{not json';
    const { getConfig, DEFAULT_CONFIG } = loadConfig();
    expect(await getConfig()).toEqual(DEFAULT_CONFIG);
  });

  it('ignores settings saved by older versions (older storage key)', async () => {
    mockStorage['@speedmonitor_config_v2'] = JSON.stringify({ serverUrl: 'http://192.168.1.5:8000' });
    expect((await loadConfig().getConfig()).serverUrl).toBe('https://netspeed.handt.ai');
  });

  it('saveConfig merges into the current settings and returns them', async () => {
    const { saveConfig, getConfig } = loadConfig();
    await saveConfig({ wifiOnly: true });
    const updated = await saveConfig({ testLabel: 'Home' });
    expect(updated).toMatchObject({ wifiOnly: true, testLabel: 'Home' });
    expect(await getConfig()).toEqual(updated);
  });
});

describe('getDeviceId', () => {
  it('creates an ID once and keeps it', async () => {
    const first = await loadConfig().getDeviceId();
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(mockStorage[DEVICE_KEY]).toBe(first);
    expect(await loadConfig().getDeviceId()).toBe(first); // after a restart
  });

  it('on iOS uses the native ID so background tests use the same device', async () => {
    const original = Platform.OS;
    (Platform as any).OS = 'ios';
    NativeModules.NativeMonitorBridge = { getDeviceId: jest.fn(async () => ' NATIVE-ID ') };
    try {
      expect(await loadConfig().getDeviceId()).toBe('NATIVE-ID');
      expect(mockStorage[DEVICE_KEY]).toBe('NATIVE-ID');
    } finally {
      (Platform as any).OS = original;
    }
  });

  it('on iOS falls back to the saved ID when the native call fails', async () => {
    const original = Platform.OS;
    (Platform as any).OS = 'ios';
    mockStorage[DEVICE_KEY] = 'saved-id';
    NativeModules.NativeMonitorBridge = { getDeviceId: jest.fn(async () => Promise.reject(new Error('x'))) };
    try {
      expect(await loadConfig().getDeviceId()).toBe('saved-id');
    } finally {
      (Platform as any).OS = original;
    }
  });
});

describe('translations', () => {
  const englishKeys = Object.keys(translations.en);

  it('offers English and 8 Indian languages', () => {
    expect(SUPPORTED_LANGUAGES.map(l => l.id)).toEqual(['en', 'hi', 'mr', 'ta', 'te', 'bn', 'gu', 'kn', 'ml']);
    SUPPORTED_LANGUAGES.forEach(l => expect(translations[l.id]).toBeDefined());
  });

  it.each(SUPPORTED_LANGUAGES.map(l => l.id))('%s translates every English text', lang => {
    const dict = translations[lang];
    expect(englishKeys.filter(k => !dict[k]?.trim())).toEqual([]);
    expect(Object.keys(dict).filter(k => !(k in translations.en))).toEqual([]);
  });
});

describe('LanguageProvider', () => {
  // Each mount is a fresh provider, like a fresh app start; the saved language lives in storage
  function renderWithLanguage() {
    const api: { current?: ReturnType<typeof useTranslation> } = {};
    const Probe = () => {
      api.current = useTranslation();
      return <Text>{api.current.t('nav_settings')}</Text>;
    };
    let tree: ReactTestRenderer.ReactTestRenderer;
    return {
      api,
      mount: async () => {
        await act(async () => {
          tree = ReactTestRenderer.create(
            <LanguageProvider>
              <Probe />
            </LanguageProvider>
          );
        });
        return tree!;
      },
    };
  }

  it('starts in English', async () => {
    const { api, mount } = renderWithLanguage();
    const tree = await mount();
    expect(api.current!.language).toBe('en');
    expect(tree.root.findByType(Text).props.children).toBe('Settings');
  });

  it('switches language and remembers it', async () => {
    const { api, mount } = renderWithLanguage();
    const tree = await mount();
    await act(async () => {
      await api.current!.setLanguage('hi');
    });
    expect(tree.root.findByType(Text).props.children).toBe(translations.hi.nav_settings);
    expect(mockStorage['@speedmonitor_language']).toBe('hi');

    const restarted = renderWithLanguage();
    await restarted.mount();
    expect(restarted.api.current!.language).toBe('hi');
  });

  it('ignores an unknown saved language', async () => {
    mockStorage['@speedmonitor_language'] = 'xx';
    const { api, mount } = renderWithLanguage();
    await mount();
    expect(api.current!.language).toBe('en');
  });

  it('falls back to the given text, then the key, for unknown keys', async () => {
    const { api, mount } = renderWithLanguage();
    await mount();
    expect(api.current!.t('no_such_key', 'Fallback text')).toBe('Fallback text');
    expect(api.current!.t('no_such_key')).toBe('no_such_key');
  });
});
