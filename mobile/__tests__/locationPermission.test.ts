jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}));

import { Alert, Linking, NativeModules, PermissionsAndroid, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  promptForBackgroundLocation,
  requestLocationOnLaunch,
} from '../src/services/locationPermission';

const permissions = PermissionsAndroid.PERMISSIONS;
let alertSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  Platform.OS = 'ios';
  delete NativeModules.NativeMonitorBridge;
});

describe('iOS', () => {
  const bridgeWith = (status: string, ...answers: string[]) => {
    const requestLocationAccess = jest.fn();
    answers.forEach(answer => requestLocationAccess.mockResolvedValueOnce(answer));
    NativeModules.NativeMonitorBridge = {
      getLocationAccess: jest.fn(async () => status),
      requestLocationAccess,
    };
    return requestLocationAccess;
  };

  it('on first launch asks "while using", then straight away "always"', async () => {
    const request = bridgeWith('notDetermined', 'whenInUse', 'always');
    await expect(requestLocationOnLaunch()).resolves.toBe('always');
    expect(request.mock.calls).toEqual([[false], [true]]);
  });

  it('stops if the user denies the first prompt', async () => {
    const request = bridgeWith('notDetermined', 'denied');
    await expect(requestLocationOnLaunch()).resolves.toBe('denied');
    expect(request.mock.calls).toEqual([[false]]);
  });

  it('asks nothing when "always" is already granted', async () => {
    const request = bridgeWith('always');
    await expect(requestLocationOnLaunch()).resolves.toBe('always');
    expect(request).not.toHaveBeenCalled();
  });

  it('starting a background feature without "always" offers Settings', async () => {
    bridgeWith('whenInUse');
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    await promptForBackgroundLocation();
    expect(alertSpy.mock.calls[0][0]).toBe('Location access needed');
    alertSpy.mock.calls[0][2][1].onPress();
    expect(openSettings).toHaveBeenCalled();
  });

  it('starting a background feature with "always" shows nothing', async () => {
    bridgeWith('always');
    await promptForBackgroundLocation();
    expect(alertSpy).not.toHaveBeenCalled();
  });
});

describe('Android', () => {
  let granted: Set<string>;
  let request: jest.SpyInstance;

  beforeEach(() => {
    Platform.OS = 'android';
    Object.defineProperty(Platform, 'Version', { configurable: true, get: () => 34 });
    granted = new Set();
    jest.spyOn(PermissionsAndroid, 'check').mockImplementation(async p => granted.has(p));
    request = jest.spyOn(PermissionsAndroid, 'request').mockImplementation(async p => {
      granted.add(p);
      return 'granted';
    });
  });

  it('asks foreground first, explains, then asks background', async () => {
    alertSpy.mockImplementation((_t, _m, buttons: any) => buttons[1].onPress());
    await expect(requestLocationOnLaunch()).resolves.toBe('always');
    expect(request.mock.calls.map(c => c[0])).toEqual([
      permissions.ACCESS_FINE_LOCATION,
      permissions.ACCESS_BACKGROUND_LOCATION,
    ]);
  });

  it('does not repeat the launch question once it has been asked', async () => {
    granted.add(permissions.ACCESS_FINE_LOCATION);
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('1');
    await expect(requestLocationOnLaunch()).resolves.toBe('whenInUse');
    expect(alertSpy).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it('respects "Not Now"', async () => {
    granted.add(permissions.ACCESS_FINE_LOCATION);
    alertSpy.mockImplementation((_t, _m, buttons: any) => buttons[0].onPress());
    await expect(requestLocationOnLaunch()).resolves.toBe('whenInUse');
    expect(request).not.toHaveBeenCalled();
  });

  it('stops if location is denied', async () => {
    request.mockResolvedValue('denied');
    await expect(requestLocationOnLaunch()).resolves.toBe('denied');
    expect(alertSpy).not.toHaveBeenCalled();
  });
});
