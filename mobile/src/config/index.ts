import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppConfig } from '../types';
import { generateUUID } from '../utils/uuid';

const STORAGE_KEY_CONFIG = '@speedmonitor_config';
const STORAGE_KEY_DEVICE_ID = '@speedmonitor_device_id';

export const DEFAULT_CONFIG: AppConfig = {
  serverUrl: 'http://172.20.10.10:8000', // Mac Hotspot IP
  testIntervalSeconds: 10, // 10 seconds for rapid background & killed state verification
  downloadMB: 2,
  uploadMB: 1,
  wifiOnly: false,
  batchSize: 20,
};

let cachedDeviceId: string | null = null;
let cachedConfig: AppConfig | null = null;

export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY_DEVICE_ID);
    if (saved) {
      cachedDeviceId = saved;
      return saved;
    }
  } catch (e) {
    console.warn('Failed to load device ID from storage', e);
  }

  const newId = generateUUID();
  cachedDeviceId = newId;
  try {
    await AsyncStorage.setItem(STORAGE_KEY_DEVICE_ID, newId);
  } catch (e) {
    console.warn('Failed to save device ID to storage', e);
  }
  return newId;
}

export async function getConfig(): Promise<AppConfig> {
  if (cachedConfig) return cachedConfig;
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY_CONFIG);
    if (saved) {
      const parsed = JSON.parse(saved);
      const merged: AppConfig = { ...DEFAULT_CONFIG, ...parsed };
      cachedConfig = merged;
      return merged;
    }
  } catch (e) {
    console.warn('Failed to load config from storage', e);
  }

  const fallback: AppConfig = { ...DEFAULT_CONFIG };
  cachedConfig = fallback;
  return fallback;
}

export async function saveConfig(newConfig: Partial<AppConfig>): Promise<AppConfig> {
  const current = await getConfig();
  const updated: AppConfig = { ...current, ...newConfig };
  cachedConfig = updated;
  try {
    await AsyncStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to persist config', e);
  }
  return updated;
}
