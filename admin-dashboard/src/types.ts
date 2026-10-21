export interface TelemetrySample {
  id: string;
  device_id: string;
  ts: number;
  test_type?: string;
  down_mbps: number | null;
  up_mbps: number | null;
  latency_ms: number | null;
  jitter_ms: number | null;
  packet_loss_pct: number | null;
  network: string | null;
  radio: string | null;
  carrier: string | null;
  device_model?: string | null;
  os_platform?: string | null;
  location_type?: string | null;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  video_delay_ms?: number | null;
  web_delay_ms?: number | null;
  page_load_sec?: number | null;
  ttfb_ms?: number | null;
  streaming_quality?: string | null;
  signal_dbm?: number | null;
  signal_quality?: string | null;
  cell_tower?: string | null;
  frequency_band?: string | null;
  created_at?: string;
}

export interface AdminStats {
  total_tests: number;
  total_devices: number;
  tests_today: number;
  avg_down_mbps: number;
  avg_up_mbps: number;
  avg_latency_ms: number;
  top_carrier: string;
}

export interface OperatorAnalytics {
  carrier: string;
  radio: string;
  avg_down: number;
  avg_up: number;
  avg_latency: number;
  test_count: number;
}

export interface DeviceSummary {
  device_id: string;
  device_model: string | null;
  os_platform: string | null;
  carrier: string | null;
  total_tests: number;
  avg_down: number | null;
  avg_latency: number | null;
  last_active: number;
}

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  carrier: string;
  radio: string;
  down_mbps: number | null;
  up_mbps: number | null;
  latency_ms: number | null;
  signal_dbm: number | null;
  test_type?: string;
  ts: number;
  metric: string;
  metric_value: number;
  rating: 'Excellent' | 'Better' | 'Good' | 'Poor';
  color: string;
}

export interface LocationSearchResult {
  name: string;
  lat: number;
  lng: number;
}
