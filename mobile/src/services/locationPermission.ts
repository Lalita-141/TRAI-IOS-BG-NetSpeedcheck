import { Alert, Linking, NativeModules, PermissionsAndroid, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type LocationAccess = 'always' | 'whenInUse' | 'denied' | 'notDetermined';

const STORAGE_KEY_ANDROID_ASKED = '@speedmonitor_background_location_asked';

const WHY_ALWAYS =
  'To keep tests running with the screen off or the app in the background, choose "Allow all the time" for location.';

function askOnAndroid(): Promise<boolean> {
  return new Promise(resolve => {
    Alert.alert('Allow location all the time', `${WHY_ALWAYS}\n\nThe next screen shows this option.`, [
      { text: 'Not Now', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Continue', onPress: () => resolve(true) },
    ]);
  });
}

export async function getLocationAccess(): Promise<LocationAccess> {
  if (Platform.OS === 'ios') {
    const bridge = NativeModules.NativeMonitorBridge;
    return bridge?.getLocationAccess ? bridge.getLocationAccess() : 'notDetermined';
  }
  const { ACCESS_FINE_LOCATION, ACCESS_COARSE_LOCATION, ACCESS_BACKGROUND_LOCATION } = PermissionsAndroid.PERMISSIONS;
  const foreground =
    (await PermissionsAndroid.check(ACCESS_FINE_LOCATION)) ||
    (await PermissionsAndroid.check(ACCESS_COARSE_LOCATION));
  if (!foreground) return 'notDetermined';
  // Android 9 and older have no separate background permission
  if ((Platform.Version as number) < 29) return 'always';
  return (await PermissionsAndroid.check(ACCESS_BACKGROUND_LOCATION)) ? 'always' : 'whenInUse';
}

/**
 * Asks for location in the only order the operating systems allow: "while using"
 * first, then straight away the upgrade to "always". Neither iOS nor Android 11+
 * can offer "always" in the first prompt.
 */
export async function requestLocationOnLaunch(): Promise<LocationAccess> {
  if (Platform.OS === 'ios') {
    const bridge = NativeModules.NativeMonitorBridge;
    if (!bridge?.requestLocationAccess) return 'notDetermined';
    let access: LocationAccess = await bridge.getLocationAccess();
    if (access === 'notDetermined') {
      access = await bridge.requestLocationAccess(false);
    }
    if (access === 'whenInUse') {
      // iOS shows this upgrade prompt only once; it does nothing after that
      access = await bridge.requestLocationAccess(true);
    }
    return access;
  }

  const { ACCESS_FINE_LOCATION, ACCESS_BACKGROUND_LOCATION } = PermissionsAndroid.PERMISSIONS;
  let access = await getLocationAccess();
  if (access === 'notDetermined') {
    const result = await PermissionsAndroid.request(ACCESS_FINE_LOCATION);
    if (result !== PermissionsAndroid.RESULTS.GRANTED) return 'denied';
    access = await getLocationAccess();
  }
  if (access === 'whenInUse') {
    const asked = await AsyncStorage.getItem(STORAGE_KEY_ANDROID_ASKED);
    if (!asked) {
      await AsyncStorage.setItem(STORAGE_KEY_ANDROID_ASKED, '1');
      if (await askOnAndroid()) {
        // On Android 11+ this opens the Settings page that has "Allow all the time"
        await PermissionsAndroid.request(ACCESS_BACKGROUND_LOCATION);
        access = await getLocationAccess();
      }
    }
  }
  return access;
}

/** Called when a background feature starts: tells the user if "always" is still missing. */
export async function promptForBackgroundLocation(): Promise<void> {
  const access = await getLocationAccess();
  if (access === 'always' || access === 'notDetermined') return;

  const steps =
    Platform.OS === 'ios'
      ? 'In Settings, tap Location and choose "Always".'
      : 'In Settings, tap Permissions, then Location, and choose "Allow all the time".';
  Alert.alert('Location access needed', `${WHY_ALWAYS}\n\n${steps}`, [
    { text: 'Not Now', style: 'cancel' },
    { text: 'Open Settings', onPress: () => Linking.openSettings() },
  ]);
}
