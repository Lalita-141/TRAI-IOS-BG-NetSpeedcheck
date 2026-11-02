import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Sample } from '../types';
import { getConfig } from '../config';

export const NOT_MEASURED = '--';

export const displayCarrier = (sample?: Sample | null): string => {
  if (sample?.carrier && sample.carrier !== '--' && sample.carrier !== 'wifi') return sample.carrier;
  return sample?.network === 'wifi' ? 'Wi-Fi' : NOT_MEASURED;
};

export const displayRadio = (sample?: Sample | null): string =>
  sample?.radio || (sample?.network === 'wifi' ? 'Wi-Fi' : NOT_MEASURED);

export const signalUnavailableText = () =>
  Platform.OS === 'ios' ? 'Not available on iOS' : 'Not available';

export const displaySignal = (sample?: Sample | null): string =>
  sample?.signal_dbm != null ? `${Math.round(sample.signal_dbm)} dBm` : signalUnavailableText();

/** Host name of the server the tests really ran against. */
export function useTestServerHost(): string {
  const [host, setHost] = useState(NOT_MEASURED);
  useEffect(() => {
    getConfig().then(config => {
      setHost(config.serverUrl.replace(/^[a-z]+:\/\//i, '').replace(/[/:].*$/, ''));
    });
  }, []);
  return host;
}
