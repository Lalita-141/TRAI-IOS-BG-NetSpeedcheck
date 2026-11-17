/**
 * The Coverage test is Android only (iPhone has no signal-strength data).
 */
import React from 'react';
import { Platform, Text } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { ContinuousTestSetupView } from '../src/components/ContinuousTestSetupView';
import { isCoverageTestSupported } from '../src/utils/platformFeatures';

const realOS = Platform.OS;
const setOS = (os: string) => Object.defineProperty(Platform, 'OS', { value: os, configurable: true, writable: true });
afterEach(() => setOS(realOS));

const texts = (tree: ReactTestRenderer.ReactTestRenderer) =>
  tree.root.findAllByType(Text).map(t => [].concat(t.props.children).join(''));

function mountSetup(props: Partial<React.ComponentProps<typeof ContinuousTestSetupView>> = {}) {
  const onStartTest = jest.fn();
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    tree = ReactTestRenderer.create(<ContinuousTestSetupView onBack={() => {}} onStartTest={onStartTest} {...props} />);
  });
  const start = () => {
    const button = tree.root
      .findAll(n => typeof n.props.onPress === 'function')
      .find(n => n.findAllByType(Text).some(t => /start/i.test([].concat(t.props.children).join(''))));
    act(() => button!.props.onPress());
  };
  return { tree, onStartTest, start };
}

describe('isCoverageTestSupported', () => {
  it('is true on Android and false on iOS', () => {
    setOS('android');
    expect(isCoverageTestSupported()).toBe(true);
    setOS('ios');
    expect(isCoverageTestSupported()).toBe(false);
  });
});

describe('Continuous test setup', () => {
  it('Android: shows Coverage and starts with it selected (unchanged)', () => {
    setOS('android');
    const { tree, onStartTest, start } = mountSetup();
    expect(texts(tree)).toEqual(expect.arrayContaining(['Coverage', 'Speed Test']));
    start();
    expect(onStartTest).toHaveBeenCalledWith(expect.objectContaining({ testType: 'coverage' }));
    act(() => tree.unmount());
  });

  it('iOS: hides Coverage and starts with Speed Test selected', () => {
    setOS('ios');
    const { tree, onStartTest, start } = mountSetup();
    expect(texts(tree)).not.toContain('Coverage');
    expect(texts(tree)).toContain('Speed Test');
    start();
    expect(onStartTest).toHaveBeenCalledWith(expect.objectContaining({ testType: 'speed' }));
    act(() => tree.unmount());
  });

  it('iOS: an old Coverage setting falls back to Speed Test', () => {
    setOS('ios');
    const { tree, onStartTest, start } = mountSetup({
      activeConfig: { testType: 'coverage', gapSeconds: 10, durationMins: 15 },
    });
    start();
    expect(onStartTest).toHaveBeenCalledWith({ testType: 'speed', gapSeconds: 10, durationMins: 15 });
    act(() => tree.unmount());
  });

  it('iOS: Video stays available', () => {
    setOS('ios');
    const { tree } = mountSetup({ activeConfig: { testType: 'video_browser', gapSeconds: 5, durationMins: 10 } });
    expect(texts(tree).some(t => t.startsWith('Video'))).toBe(true);
    act(() => tree.unmount());
  });
});
