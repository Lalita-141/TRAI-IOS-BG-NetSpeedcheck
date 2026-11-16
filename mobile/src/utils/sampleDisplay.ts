import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Sample } from '../types';
import { getConfig } from '../config';

export const NOT_MEASURED = '--';

export const displayCarrier = (sample?: Sample | null): string => {
  if (sample?.carrier && sample.carrier !== '--' && sample.carrier !== 'wifi')
    return sample.carrier;
  return sample?.network === 'wifi' ? 'Wi-Fi' : NOT_MEASURED;
};

export const displayRadio = (sample?: Sample | null): string =>
  sample?.radio || (sample?.network === 'wifi' ? 'Wi-Fi' : NOT_MEASURED);

export const signalUnavailableText = () =>
  Platform.OS === 'ios' ? 'Not available on iOS' : 'Not available';

export const displaySignal = (sample?: Sample | null): string =>
  sample?.signal_dbm != null
    ? `${Math.round(sample.signal_dbm)} dBm`
    : signalUnavailableText();

/**
 * What a saved result measured, so screens show its real values instead of "--".
 * Advance (continuous) results are all saved as 'continuous', so the kind comes from the values:
 * - 'video': a video & browser test (no upload, packet loss or jitter)
 * - 'coverage': a continuous coverage cycle (no download or upload)
 * - 'speed': everything else (unchanged layout)
 */
export type SampleKind = 'speed' | 'video' | 'coverage';
export const sampleKind = (sample: Sample): SampleKind => {
  const type = (sample.test_type || '').toLowerCase();
  if (type === 'video' || type === 'video_browser') return 'video';
  const hasVideoValues =
    sample.video_delay_ms != null ||
    sample.web_delay_ms != null ||
    !!sample.streaming_quality;
  if (sample.up_mbps == null && hasVideoValues) return 'video';
  if (
    type === 'continuous' &&
    sample.down_mbps == null &&
    sample.up_mbps == null
  )
    return 'coverage';
  return 'speed';
};

/** Host name of the server the tests really ran against. */
export function useTestServerHost(): string {
  const [host, setHost] = useState(NOT_MEASURED);
  useEffect(() => {
    getConfig().then(config => {
      setHost(
        config.serverUrl.replace(/^[a-z]+:\/\//i, '').replace(/[/:].*$/, ''),
      );
    });
  }, []);
  return host;
}
