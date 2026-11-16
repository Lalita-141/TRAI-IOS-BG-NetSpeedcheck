/**
 * Screens: the splash screen and the Settings screen.
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
jest.mock('react-native-svg', () => {
  const ReactLib = require('react');
  const svg = (name: string) => (props: any) => ReactLib.createElement(name, props, props.children);
  return {
    __esModule: true,
    default: svg('Svg'),
    Svg: svg('Svg'),
    Circle: svg('Circle'),
    Path: svg('Path'),
    Rect: svg('Rect'),
    G: svg('G'),
    Line: svg('Line'),
    Polyline: svg('Polyline'),
    Polygon: svg('Polygon'),
    Ellipse: svg('Ellipse'),
    Text: svg('SvgText'),
    Defs: svg('Defs'),
    LinearGradient: svg('LinearGradient'),
    RadialGradient: svg('RadialGradient'),
    Stop: svg('Stop'),
    ClipPath: svg('ClipPath'),
    Mask: svg('Mask'),
  };
});

import React from 'react';
import { AccessibilityInfo, Image, Text } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { SplashScreen } from '../src/components/SplashScreen';
import { SettingsView } from '../src/components/SettingsView';
import { LanguageProvider } from '../src/i18n';

const allText = (tree: ReactTestRenderer.ReactTestRenderer) =>
  tree.root
    .findAllByType(Text)
    .map(t => [].concat(t.props.children).filter(c => typeof c === 'string' || typeof c === 'number').join(''))
    .join('\n');

beforeEach(() => {
  Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('SplashScreen', () => {
  async function mount(reduceMotion: boolean) {
    jest.useFakeTimers();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(reduceMotion);
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = ReactTestRenderer.create(<SplashScreen />);
    });
    return tree;
  }

  it('shows the logo, app name and company name', async () => {
    const tree = await mount(false);
    const text = allText(tree);
    expect(text).toContain('NetSpeed Monitor');
    expect(text).toContain('Network QoS & Performance');
    expect(text).toContain('Developed by');
    expect(text).toContain('HARE AND TURTLE AI SOLUTIONS\nPRIVATE LIMITED');
    expect(tree.root.findAllByType(Image).length).toBeGreaterThanOrEqual(1);
    expect(tree.root.findByProps({ accessibilityLabel: 'Hare & Turtle AI Solutions' })).toBeTruthy();
    act(() => tree.unmount());
  });

  it('tapping the logo is safe', async () => {
    const tree = await mount(false);
    act(() => {
      tree.root.findAllByProps({ accessibilityLabel: 'Hare & Turtle AI Solutions' })[0].props.onPress();
    });
    expect(allText(tree)).toContain('NetSpeed Monitor');
    act(() => tree.unmount());
  });

  it.each([
    ['with animations', false],
    ['with Reduce Motion on', true],
  ])('goes away after about 4 seconds %s', async (_label, reduceMotion) => {
    const tree = await mount(reduceMotion);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(3000);
    });
    expect(tree.toJSON()).not.toBeNull();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1500); // 3.5 s visible + 0.5 s fade
    });
    expect(tree.toJSON()).toBeNull();
    act(() => tree.unmount());
  });
});

describe('SettingsView', () => {
  async function mount() {
    const onConfigChanged = jest.fn();
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = ReactTestRenderer.create(
        <LanguageProvider>
          <SettingsView onConfigChanged={onConfigChanged} />
        </LanguageProvider>
      );
    });
    return { tree, onConfigChanged };
  }

  it('shows the company logo and name at the bottom', async () => {
    const { tree } = await mount();
    const text = allText(tree);
    expect(text).toContain('Developed by');
    expect(text).toContain('HARE AND TURTLE AI SOLUTIONS PRIVATE LIMITED');
    const logo = tree.root.findAllByType(Image).find(i => i.props.source === require('../src/assets/splash-logo.png'));
    expect(logo).toBeDefined();
    act(() => tree.unmount());
  });

  it('shows the per-test data limit and network mode', async () => {
    const { tree } = await mount();
    expect(allText(tree)).toContain('Up to 100MB Down • 50MB Up • Wi-Fi & Cellular');
    act(() => tree.unmount());
  });

  it('shows "Wi-Fi Only" once that setting is saved', async () => {
    const config = require('../src/config'); // the same settings module the screen reads
    await config.saveConfig({ wifiOnly: true });
    const { tree } = await mount();
    expect(allText(tree)).toContain('Up to 100MB Down • 50MB Up • Wi-Fi Only');
    await config.saveConfig({ wifiOnly: false });
    act(() => tree.unmount());
  });

  it('lists every settings section', async () => {
    const { tree } = await mount();
    const text = allText(tree);
    ['App Language', 'About Data Usage', 'Frequently Asked Question', 'About Us', 'Export Test Results'].forEach(title =>
      expect(text).toContain(title)
    );
    act(() => tree.unmount());
  });

  it('the FAQ describes the 8-second, 100 MB / 50 MB test', async () => {
    const { tree } = await mount();
    const faqCard = tree.root
      .findAll(n => typeof n.props.onPress === 'function')
      .find(n => n.findAllByType(Text).some(t => t.props.children === 'Frequently Asked Question'));
    await act(async () => {
      faqCard!.props.onPress();
    });
    const dataQuestion = tree.root
      .findAll(n => typeof n.props.onPress === 'function')
      .find(n => n.findAllByType(Text).some(t => t.props.children === 'Does background monitoring exhaust mobile data?'));
    await act(async () => {
      dataQuestion!.props.onPress();
    });
    expect(allText(tree)).toContain('about 8 seconds each way and can use up to 100 MB download and 50 MB upload');
    act(() => tree.unmount());
  });
});
