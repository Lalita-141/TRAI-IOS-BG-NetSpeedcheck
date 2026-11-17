import { Platform } from 'react-native';

/**
 * The Coverage test rates signal strength (dBm), cell tower and band. Android reports these;
 * iOS has no public API for them, so on iPhone the Coverage test is hidden (Home screen and
 * Advance > Continuous). Coverage results synced from Android still show in History and on the Map.
 */
export const isCoverageTestSupported = (): boolean => Platform.OS === 'android';
