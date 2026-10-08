export interface Sample {
  id: string;
  device_id: string;
  ts: number; // Unix timestamp in seconds
  down_mbps: number | null;
  up_mbps: number | null;
  latency_ms: number | null;
  jitter_ms: number | null; // TRAI QoS Jitter metric
  packet_loss_pct: number | null; // TRAI Packet loss percentage
  network: string | null; // 'wifi' | 'cellular' | 'ethernet' | 'other' | 'none'
  radio: string | null; // '5G' | '4G / LTE' | '3G' | '2G' etc.
  carrier: string | null; // 'Jio' | 'Airtel' | 'BSNL' | 'Vi' etc.
  device_model?: string | null;
  os_platform?: string | null;
  location_type?: string | null; // 'Indoor' | 'Outdoor'
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
}

export interface AppConfig {
  serverUrl: string;
  testIntervalSeconds: number;
  downloadMB: number;
  uploadMB: number;
  wifiOnly: boolean;
  batchSize: number;
  deviceId?: string;
}

export type TestPhase = 'idle' | 'ping' | 'download' | 'upload' | 'saving' | 'complete' | 'error';

export interface SpeedTestProgress {
  phase: TestPhase;
  currentSpeed?: number;
  latency?: number;
  downSpeed?: number;
  upSpeed?: number;
  message: string;
  progressPercent: number; // 0 to 100
}

export interface NetworkInfo {
  type: string;
  isConnected: boolean;
  isInternetReachable: boolean | null;
  details?: {
    cellularGeneration?: string | null;
    carrier?: string | null;
    isConnectionExpensive?: boolean;
  } | null;
}

export interface GeoLocationResult {
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
}
