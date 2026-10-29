export interface Sample {
  id: string;
  device_id: string;
  ts: number; // Unix timestamp in seconds
  down_mbps: number | null;
  up_mbps: number | null;
  latency_ms: number | null;
  jitter_ms: number | null; // QoS Jitter metric
  packet_loss_pct: number | null; // Packet loss percentage
  network: string | null; // 'wifi' | 'cellular' | 'ethernet' | 'other' | 'none'
  radio: string | null; // '5G' | '4G / LTE' | '3G' | '2G' etc.
  carrier: string | null; // 'Jio' | 'Airtel' | 'BSNL' | 'Vi' etc.
  device_model?: string | null;
  os_platform?: string | null;
  location_type?: string | null; // 'Indoor' | 'Outdoor'
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  test_type?: 'speed' | 'video' | 'coverage' | 'advance' | 'continuous' | 'scheduled' | string;
  // Video & Web Browsing QoS (stored by the server's samples table)
  video_delay_ms?: number | null;
  web_delay_ms?: number | null;
  page_load_sec?: number | null;
  ttfb_ms?: number | null;
  streaming_quality?: string | null;
  // Actual RF measurements. Null unless genuinely measured by the device
  // (never available on iOS; never derived from speed, GPS or connection type).
  signal_dbm?: number | null;
  signal_quality?: string | null;
  cell_tower?: string | null;
  frequency_band?: string | null;
  // Network Experience Coverage metadata
  measurement_source?: string | null; // 'ios_network_experience' | 'android_network_experience' | 'android_telephony'
  quality_category?: string | null; // ExperienceCategory from config/coverageThresholds
  failure_reason?: string | null; // 'no_path' | 'timeout' | 'http_error' | 'location_unavailable' ...
  link_quality?: string | null; // iOS 26+ NWPath.linkQuality: 'good' | 'moderate' | 'minimal' | 'unknown'
  location_ts?: number | null; // Unix seconds of the GPS fix (may predate ts)
  speed_mps?: number | null; // GPS ground speed
  session_id?: string | null; // groups samples of one coverage survey
  is_pending?: boolean; // UI only: still waiting in the local queue for upload
}

export interface AppConfig {
  serverUrl: string;
  testIntervalSeconds: number;
  downloadMB: number;
  uploadMB: number;
  wifiOnly: boolean;
  batchSize: number;
  deviceId?: string;
  maxHistoryLimit?: number;
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
  timestamp?: number | null; // ms epoch of the GPS fix
  speed?: number | null; // m/s ground speed, null when unknown
}
