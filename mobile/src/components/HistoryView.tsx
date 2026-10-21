import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  TouchableWithoutFeedback,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Sample } from '../types';
import { sampleStore } from '../services/sampleStore';
import { exportSamplesAsCSV, exportSamplesAsJSON } from '../utils/exportUtils';
import {
  DownloadIcon,
  UploadIcon,
  ClockIcon,
  WaveformIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CloseIcon,
  LightningIcon,
  VideoBrowserTestIcon,
  CoverageTestIcon,
  AdvanceTestsIcon,
  PinIcon,
  CrosshairIcon,
  PlusIcon,
  MinusIcon,
} from './Icons';
import { useTranslation } from '../i18n';
import { HistoryTestDetailView } from './HistoryTestDetailView';

interface HistoryViewProps {
  samples: Sample[];
  currentLocation?: { lat: number | null; lng: number | null } | null;
  onRefresh: () => void;
  onNavigateTab?: (tab: 'SPEED' | 'MAP' | 'HISTORY' | 'SETTINGS') => void;
}

export type TestTypeFilter = 'ALL' | 'SPEED' | 'VIDEO' | 'COVERAGE' | 'ADVANCE';
export type OperatorFilter = 'ALL' | 'AIRTEL' | 'JIO' | 'VI' | 'BSNL';
export type ModeFilter = 'ALL' | 'WIFI' | 'MOBILE_DATA';
export type ActiveDropdown = 'operator' | 'mode' | null;

interface FilterState {
  testType: TestTypeFilter;
  operator: OperatorFilter;
  mode: ModeFilter;
  activeDropdown: ActiveDropdown;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  samples,
  currentLocation,
  onRefresh,
  onNavigateTab,
}) => {
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [historyMapType, setHistoryMapType] = useState<'map' | 'satellite'>('map');
  const mapWebViewRef = useRef<any>(null);
  const [filters, setFilters] = useState<FilterState>({
    testType: 'ALL',
    operator: 'ALL',
    mode: 'ALL',
    activeDropdown: null,
  });

  const selectedTestType = filters.testType;
  const selectedOperator = filters.operator;
  const selectedMode = filters.mode;
  const activeDropdown = filters.activeDropdown;

  const setSelectedTestType = (testType: TestTypeFilter) => {
    setFilters(prev => ({ ...prev, testType, activeDropdown: null }));
  };

  const setSelectedOperator = (operator: OperatorFilter) => {
    setFilters(prev => ({ ...prev, operator, activeDropdown: null }));
  };

  const setSelectedMode = (mode: ModeFilter) => {
    setFilters(prev => ({ ...prev, mode, activeDropdown: null }));
  };

  const setActiveDropdown = (dropdown: ActiveDropdown) => {
    setFilters(prev => ({ ...prev, activeDropdown: dropdown }));
  };

  const resetAllFilters = () => {
    setFilters({
      testType: 'ALL',
      operator: 'ALL',
      mode: 'ALL',
      activeDropdown: null,
    });
  };

  const [selectedSampleForDetail, setSelectedSampleForDetail] = useState<Sample | null>(null);
  const [capacityInfo, setCapacityInfo] = useState<{
    count: number;
    maxLimit: number;
    isFull: boolean;
    usagePercent: number;
  }>({
    count: samples.length,
    maxLimit: sampleStore.getMaxHistoryLimit(),
    isFull: samples.length >= sampleStore.getMaxHistoryLimit(),
    usagePercent: Math.min(100, Math.round((samples.length / sampleStore.getMaxHistoryLimit()) * 100)),
  });

  useEffect(() => {
    let isMounted = true;
    sampleStore.getCapacityInfo().then(info => {
      if (isMounted) setCapacityInfo(info);
    });
    return () => {
      isMounted = false;
    };
  }, [samples]);

  // Count items per test type for pill badges
  const testTypeCounts = useMemo(() => {
    const counts = { ALL: samples.length, SPEED: 0, VIDEO: 0, COVERAGE: 0, ADVANCE: 0 };
    samples.forEach(s => {
      const typeStr = (s.test_type || 'speed').toLowerCase();
      if (typeStr === 'video' || typeStr === 'video_browser') counts.VIDEO++;
      else if (typeStr === 'coverage') counts.COVERAGE++;
      else if (typeStr === 'advance' || typeStr === 'continuous' || typeStr === 'scheduled') counts.ADVANCE++;
      else counts.SPEED++;
    });
    return counts;
  }, [samples]);

  // Multi-dimensional filtering: Test Type + Operator + Test Mode
  const filteredSamples = useMemo(() => {
    return samples.filter(s => {
      // 1. Test Type
      const typeStr = (s.test_type || 'speed').toLowerCase();
      if (selectedTestType === 'SPEED' && typeStr !== 'speed') return false;
      if (selectedTestType === 'VIDEO' && typeStr !== 'video' && typeStr !== 'video_browser') return false;
      if (selectedTestType === 'COVERAGE' && typeStr !== 'coverage') return false;
      if (selectedTestType === 'ADVANCE' && typeStr !== 'advance' && typeStr !== 'continuous' && typeStr !== 'scheduled') return false;

      // 2. Operator
      if (selectedOperator !== 'ALL') {
        const carrier = (s.carrier || '').toLowerCase();
        if (selectedOperator === 'AIRTEL' && !carrier.includes('airtel')) return false;
        if (selectedOperator === 'JIO' && !carrier.includes('jio')) return false;
        if (
          selectedOperator === 'VI' &&
          !carrier.includes('vi') &&
          !carrier.includes('vodafone') &&
          !carrier.includes('idea')
        )
          return false;
        if (selectedOperator === 'BSNL' && !carrier.includes('bsnl') && !carrier.includes('mtnl'))
          return false;
      }

      // 3. Test Mode (Wi-Fi vs Mobile Data)
      if (selectedMode === 'WIFI' && s.network !== 'wifi') return false;
      if (selectedMode === 'MOBILE_DATA' && s.network === 'wifi') return false;

      return true;
    });
  }, [samples, selectedTestType, selectedOperator, selectedMode]);

  // Aggregate statistics dynamically computed from filtered results
  const summary = useMemo(() => {
    if (filteredSamples.length === 0) {
      return { total: 0, avgDown: 0, avgUp: 0, avgPing: 0 };
    }
    let sumDown = 0;
    let sumUp = 0;
    let sumPing = 0;
    let pingCount = 0;

    filteredSamples.forEach(s => {
      if (s.down_mbps != null) sumDown += s.down_mbps;
      if (s.up_mbps != null) sumUp += s.up_mbps;
      if (s.latency_ms != null) {
        sumPing += s.latency_ms;
        pingCount++;
      }
    });

    return {
      total: filteredSamples.length,
      avgDown: parseFloat((sumDown / filteredSamples.length).toFixed(1)),
      avgUp: parseFloat((sumUp / filteredSamples.length).toFixed(1)),
      avgPing: pingCount > 0 ? Math.round(sumPing / pingCount) : 0,
    };
  }, [filteredSamples]);

  const hasActiveFilters =
    selectedTestType !== 'ALL' || selectedOperator !== 'ALL' || selectedMode !== 'ALL';

  // Group or date label
  const latestDateLabel = useMemo(() => {
    if (filteredSamples.length === 0) return 'Test Records';
    const firstDate = new Date(filteredSamples[0].ts * 1000);
    return firstDate.toLocaleDateString([], {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }, [filteredSamples]);

  // Default map center: Location -> Sample with coords -> Fallback (Pune)
  const defaultCenter = useMemo(() => {
    if (currentLocation?.lat && currentLocation?.lng) {
      return { lat: currentLocation.lat, lng: currentLocation.lng };
    }
    const sampleWithCoords = samples.find(s => s.lat != null && s.lng != null);
    if (sampleWithCoords && sampleWithCoords.lat && sampleWithCoords.lng) {
      return { lat: sampleWithCoords.lat, lng: sampleWithCoords.lng };
    }
    return { lat: 18.5204, lng: 73.8567 };
  }, [currentLocation, samples]);

  // Transform filtered samples into map markers with valid coordinates
  const mapMarkersData = useMemo(() => {
    const centerLat = defaultCenter.lat;
    const centerLng = defaultCenter.lng;

    return filteredSamples.map((s, idx) => {
      let lat = s.lat;
      let lng = s.lng;
      const isSimulated = lat == null || lng == null;

      if (lat == null || lng == null) {
        // Deterministic hash offset around center for tests without GPS
        const str = s.id || `${s.ts}_${idx}`;
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
          hash = (hash * 31 + str.charCodeAt(i)) % 1000000;
        }
        const absHash = Math.abs(hash);
        const r = 0.007 + (absHash % 45) * 0.0006;
        const theta = ((absHash % 360) * Math.PI) / 180;
        lat = centerLat + r * Math.sin(theta);
        lng = centerLng + (r / Math.cos((centerLat * Math.PI) / 180)) * Math.cos(theta);
      }

      const down = s.down_mbps || 0;
      const up = s.up_mbps || 0;
      const ping = s.latency_ms || 0;
      const jitter = s.jitter_ms || 0;
      const testType = (s.test_type || 'speed').toUpperCase();
      const carrier =
        s.carrier && s.carrier !== '--' && s.carrier !== 'wifi'
          ? s.carrier
          : s.network === 'wifi'
          ? 'Wi-Fi'
          : s.radio || 'Cellular';

      const d = new Date(s.ts * 1000);
      const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });

      let color = '#EF4444';
      if (down >= 50) color = '#10B981';
      else if (down >= 25) color = '#00A389';
      else if (down >= 10) color = '#F59E0B';

      return {
        id: s.id,
        lat,
        lng,
        down,
        up,
        ping,
        jitter,
        testType,
        carrier,
        network: s.network === 'wifi' ? 'Wi-Fi' : s.radio || 'Mobile Data',
        timeStr,
        color,
        isSimulated,
      };
    });
  }, [filteredSamples, defaultCenter]);

  // Synchronize markers to WebView when filters change
  useEffect(() => {
    if (viewMode === 'map' && mapWebViewRef.current) {
      const payload = JSON.stringify(mapMarkersData);
      mapWebViewRef.current.injectJavaScript(
        `if (window.updateHistoryMarkers) { window.updateHistoryMarkers(${payload}); } true;`
      );
    }
  }, [mapMarkersData, viewMode]);

  const handleToggleHistoryMapType = (type: 'map' | 'satellite') => {
    setHistoryMapType(type);
    mapWebViewRef.current?.injectJavaScript(`if (window.setMapType) { window.setMapType('${type}'); } true;`);
  };

  const handleRecenterHistoryMap = () => {
    mapWebViewRef.current?.injectJavaScript('if (window.recenterHistoryMap) { window.recenterHistoryMap(); } true;');
  };

  const handleZoomInHistoryMap = () => {
    mapWebViewRef.current?.injectJavaScript('if (window.zoomInMap) { window.zoomInMap(); } true;');
  };

  const handleZoomOutHistoryMap = () => {
    mapWebViewRef.current?.injectJavaScript('if (window.zoomOutMap) { window.zoomOutMap(); } true;');
  };

  // Generate Leaflet Map HTML with custom speed pins and popups
  const historyMapHtml = useMemo(() => {
    const centerLat = defaultCenter.lat;
    const centerLng = defaultCenter.lng;
    const initialMarkersJson = JSON.stringify(mapMarkersData);

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    html, body {
      margin: 0; padding: 0; width: 100%; height: 100%;
      background: #F8FAFC;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      overflow: hidden;
    }
    #map { width: 100%; height: 100%; background: #F8FAFC; }

    /* Custom Pin Marker */
    .speed-pin-wrap {
      position: relative;
      width: 32px;
      height: 38px;
      display: flex;
      flex-direction: column;
      align-items: center;
      cursor: pointer;
    }
    .speed-pin-circle {
      width: 28px;
      height: 28px;
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #FFFFFF;
      font-size: 11px;
      font-weight: 800;
      border: 2px solid #FFFFFF;
      box-shadow: 0 4px 10px rgba(15, 23, 42, 0.3);
      letter-spacing: -0.3px;
    }
    .speed-pin-beak {
      width: 0;
      height: 0;
      border-left: 5px solid transparent;
      border-right: 5px solid transparent;
      margin-top: -1px;
    }

    /* Leaflet Popup Light Theme */
    .leaflet-popup-content-wrapper {
      background: #FFFFFF !important;
      color: #0F172A !important;
      border: 1px solid #E2E8F0 !important;
      border-radius: 14px !important;
      padding: 0 !important;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1) !important;
    }
    .leaflet-popup-tip {
      background: #FFFFFF !important;
      border: 1px solid #E2E8F0 !important;
    }
    .h-pop {
      padding: 12px 14px;
      min-width: 190px;
    }
    .h-pop-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid #F1F5F9;
      padding-bottom: 6px;
      margin-bottom: 8px;
    }
    .h-pop-badge {
      display: inline-block;
      padding: 2px 7px;
      border-radius: 6px;
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .badge-speed { background: #E6F8F5; color: #00A389; border: 1px solid #B2ECE3; }
    .badge-video { background: #EEF2FF; color: #4338CA; border: 1px solid #C7D2FE; }
    .badge-coverage { background: #ECFDF5; color: #059669; border: 1px solid #A7F3D0; }
    .badge-advance { background: #FEF3C7; color: #D97706; border: 1px solid #FDE68A; }
    .h-pop-time {
      font-size: 11px;
      font-weight: 600;
      color: #64748B;
    }
    .h-pop-carrier {
      font-size: 12px;
      font-weight: 700;
      color: #0F172A;
      margin-bottom: 8px;
    }
    .h-pop-metrics {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      background: #F8FAFC;
      padding: 8px;
      border-radius: 8px;
      border: 1px solid #E2E8F0;
    }
    .h-m-item {
      display: flex;
      flex-direction: column;
    }
    .h-m-label {
      font-size: 9.5px;
      color: #64748B;
      font-weight: 600;
      margin-bottom: 1px;
    }
    .h-m-val {
      font-size: 12.5px;
      font-weight: 800;
      color: #0F172A;
    }
    .leaflet-container .leaflet-control-attribution {
      background: rgba(255, 255, 255, 0.75) !important;
      color: #94A3B8 !important;
      font-size: 8px !important;
      padding: 1px 5px !important;
      margin: 0 !important;
    }
    .leaflet-container .leaflet-control-attribution a {
      color: #64748B !important;
      text-decoration: none !important;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var centerLat = ${centerLat};
    var centerLng = ${centerLng};
    var initialMarkers = ${initialMarkersJson};

    var map = L.map('map', {
      zoomControl: false,
      attributionControl: true,
      minZoom: 3,
      maxZoom: 18
    }).setView([centerLat, centerLng], 12);

    var lightLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    var satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: '&copy; Esri'
    });

    var markerGroup = L.featureGroup().addTo(map);

    function createMarkerIcon(m) {
      var speedText = m.down > 0 ? (m.down >= 100 ? Math.round(m.down) : m.down.toFixed(1)) : '0';
      var html = '<div class="speed-pin-wrap">' +
                   '<div class="speed-pin-circle" style="background-color:' + m.color + ';">' + speedText + '</div>' +
                   '<div class="speed-pin-beak" style="border-top:6px solid ' + m.color + ';"></div>' +
                 '</div>';
      return L.divIcon({
        className: 'custom-pin-icon',
        html: html,
        iconSize: [32, 38],
        iconAnchor: [16, 38],
        popupAnchor: [0, -36]
      });
    }

    function createPopupHtml(m) {
      var badgeClass = 'badge-speed';
      if (m.testType === 'VIDEO') badgeClass = 'badge-video';
      else if (m.testType === 'COVERAGE') badgeClass = 'badge-coverage';
      else if (m.testType === 'ADVANCE') badgeClass = 'badge-advance';

      return '<div class="h-pop">' +
               '<div class="h-pop-header">' +
                 '<span class="h-pop-badge ' + badgeClass + '">' + m.testType + '</span>' +
                 '<span class="h-pop-time">' + m.timeStr + '</span>' +
               '</div>' +
               '<div class="h-pop-carrier">' + m.carrier + ' &bull; ' + m.network + '</div>' +
               '<div class="h-pop-metrics">' +
                 '<div class="h-m-item"><span class="h-m-label">&#8595; Download</span><span class="h-m-val" style="color:' + m.color + ';">' + m.down.toFixed(1) + ' Mbps</span></div>' +
                 '<div class="h-m-item"><span class="h-m-label">&#8593; Upload</span><span class="h-m-val">' + m.up.toFixed(1) + ' Mbps</span></div>' +
                 '<div class="h-m-item"><span class="h-m-label">&#9201; Ping</span><span class="h-m-val">' + Math.round(m.ping) + ' ms</span></div>' +
                 '<div class="h-m-item"><span class="h-m-label">&#12336; Jitter</span><span class="h-m-val">' + m.jitter.toFixed(1) + ' ms</span></div>' +
               '</div>' +
               '<button onclick="selectMarkerSample(&apos;' + m.id + '&apos;)" style="margin-top:8px;width:100%;padding:6px;background:#00A389;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;">View Details &rarr;</button>' +
             '</div>';
    }

    window.selectMarkerSample = function(id) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SELECT_SAMPLE', id: id }));
      }
    };

    window.updateHistoryMarkers = function(markersData) {
      markerGroup.clearLayers();
      if (!markersData || markersData.length === 0) return;

      var latLngs = [];
      markersData.forEach(function(m) {
        var icon = createMarkerIcon(m);
        var marker = L.marker([m.lat, m.lng], { icon: icon });
        marker.bindPopup(createPopupHtml(m), { maxWidth: 260, closeButton: false });
        markerGroup.addLayer(marker);
        latLngs.push([m.lat, m.lng]);
      });

      if (latLngs.length > 0) {
        var bounds = L.latLngBounds(latLngs);
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
      }
    };

    window.setMapType = function(type) {
      if (type === 'satellite') {
        map.removeLayer(lightLayer);
        satelliteLayer.addTo(map);
      } else {
        map.removeLayer(satelliteLayer);
        lightLayer.addTo(map);
      }
    };

    window.recenterHistoryMap = function() {
      if (markerGroup.getLayers().length > 0) {
        map.fitBounds(markerGroup.getBounds(), { padding: [40, 40], maxZoom: 15 });
      } else {
        map.setView([centerLat, centerLng], 12);
      }
    };

    window.zoomInMap = function() { map.zoomIn(); };
    window.zoomOutMap = function() { map.zoomOut(); };

    // Initial render
    window.updateHistoryMarkers(initialMarkers);
  </script>
</body>
</html>
    `;
  }, [defaultCenter, mapMarkersData]);

  const handleExportPrompt = () => {
    if (samples.length === 0) {
      Alert.alert('No Data', 'No test samples available to export.');
      return;
    }

    Alert.alert(
      'Export Test History',
      `Export ${filteredSamples.length} filtered records (${samples.length} total) to your device:`,
      [
        {
          text: '📊 Export as CSV (Spreadsheet)',
          onPress: () => exportSamplesAsCSV(filteredSamples),
        },
        {
          text: '📄 Export as JSON',
          onPress: () => exportSamplesAsJSON(filteredSamples),
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const handleClearHistory = () => {
    if (samples.length === 0) return;

    Alert.alert(
      'Clear Sample History',
      `You have ${samples.length} test records stored. Would you like to export a backup before clearing?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: '📤 Export & Clear',
          onPress: async () => {
            await exportSamplesAsCSV(samples);
            await sampleStore.clearAll();
            onRefresh();
          },
        },
        {
          text: '🗑 Clear All',
          style: 'destructive',
          onPress: async () => {
            await sampleStore.clearAll();
            onRefresh();
          },
        },
      ]
    );
  };

  const formatTime = (epochSec: number) => {
    const d = new Date(epochSec * 1000);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const getTestTypeInfo = (type?: string) => {
    const typeStr = (type || 'speed').toLowerCase();
    if (typeStr === 'video' || typeStr === 'video_browser') {
      return {
        label: 'Video',
        color: '#4338CA',
        bg: '#EEF2FF',
        border: '#C7D2FE',
      };
    }
    if (typeStr === 'coverage') {
      return {
        label: 'Coverage',
        color: '#059669',
        bg: '#ECFDF5',
        border: '#A7F3D0',
      };
    }
    if (typeStr === 'advance' || typeStr === 'continuous' || typeStr === 'scheduled') {
      return {
        label: 'Advance',
        color: '#D97706',
        bg: '#FEF3C7',
        border: '#FDE68A',
      };
    }
    return {
      label: 'Speed',
      color: '#00A389',
      bg: '#E6F8F5',
      border: '#B2ECE3',
    };
  };

  const renderItem = ({ item }: { item: Sample }) => {
    const carrier =
      item.carrier && item.carrier !== '--' && item.carrier !== 'wifi'
        ? item.carrier
        : item.network === 'wifi'
        ? 'Wi-Fi'
        : item.radio || 'Cellular';

    const pillLabel =
      item.network === 'wifi'
        ? `${carrier} • Wi-Fi`
        : item.radio
        ? `${carrier} • ${item.radio}`
        : carrier;

    const typeInfo = getTestTypeInfo(item.test_type);

    return (
      <TouchableOpacity
        style={styles.recordCard}
        activeOpacity={0.85}
        onPress={() => setSelectedSampleForDetail(item)}>
        {/* Top Header Row (Time, Test Type Badge, Carrier, Chevron) */}
        <View style={styles.cardHeader}>
          <View style={styles.timeAndTypeRow}>
            <Text style={styles.timeText}>{formatTime(item.ts)}</Text>
            {/* Test Type Badge */}
            <View
              style={[
                styles.testTypeBadge,
                { backgroundColor: typeInfo.bg, borderColor: typeInfo.border },
              ]}>
              <Text style={[styles.testTypeBadgeText, { color: typeInfo.color }]}>
                {typeInfo.label}
              </Text>
            </View>
          </View>

          <View style={styles.badgeRow}>
            <View style={styles.carrierPill}>
              <Text style={styles.carrierPillText}>{pillLabel}</Text>
            </View>

            {item.location_type ? (
              <View style={styles.envPill}>
                <Text style={styles.envPillText}>{item.location_type}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.chevronBox}>
            <ChevronRightIcon size={16} color="#94A3B8" />
          </View>
        </View>

        {/* 4-Metrics Quick Columns */}
        <View style={styles.metricsRow}>
          <View style={styles.metricItem}>
            <DownloadIcon size={14} color="#0284C7" />
            <Text style={styles.metricVal}>
              {item.down_mbps != null ? item.down_mbps.toFixed(1) : '--'}
            </Text>
            <Text style={styles.metricUnit}>Mbps</Text>
          </View>

          <View style={styles.metricItem}>
            <UploadIcon size={14} color="#7C3AED" />
            <Text style={styles.metricVal}>
              {item.up_mbps != null ? item.up_mbps.toFixed(1) : '--'}
            </Text>
            <Text style={styles.metricUnit}>Mbps</Text>
          </View>

          <View style={styles.metricItem}>
            <ClockIcon size={14} color="#D97706" />
            <Text style={styles.metricVal}>
              {item.latency_ms != null ? Math.round(item.latency_ms) : '--'}
            </Text>
            <Text style={styles.metricUnit}>ms</Text>
          </View>

          <View style={styles.metricItem}>
            <WaveformIcon size={14} color="#DB2777" />
            <Text style={styles.metricVal}>
              {item.jitter_ms != null ? item.jitter_ms.toFixed(1) : '--'}
            </Text>
            <Text style={styles.metricUnit}>ms</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const operatorLabel =
    selectedOperator === 'ALL'
      ? 'All'
      : selectedOperator === 'BSNL'
      ? 'BSNL & MTNL'
      : selectedOperator.charAt(0) + selectedOperator.slice(1).toLowerCase();

  const modeLabel =
    selectedMode === 'ALL'
      ? 'All'
      : selectedMode === 'WIFI'
      ? 'Wi-Fi'
      : 'Mobile Data';

  if (selectedSampleForDetail) {
    return (
      <HistoryTestDetailView
        sample={selectedSampleForDetail}
        onBack={() => setSelectedSampleForDetail(null)}
        onNavigateTab={onNavigateTab}
      />
    );
  }

  return (
    <View style={styles.container}>
      {/* Top Segmented Sub-Nav: List | Map */}
      <View style={styles.topSegmentedRow}>
        <TouchableOpacity
          style={[styles.segmentedTab, viewMode === 'list' && styles.segmentedTabActive]}
          onPress={() => setViewMode('list')}
          activeOpacity={0.8}>
          <Text
            style={[
              styles.segmentedTabText,
              viewMode === 'list' && styles.segmentedTabTextActive,
            ]}>
            {t('tab_list', 'List')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.segmentedTab, viewMode === 'map' && styles.segmentedTabActive]}
          onPress={() => setViewMode('map')}
          activeOpacity={0.8}>
          <Text
            style={[
              styles.segmentedTabText,
              viewMode === 'map' && styles.segmentedTabTextActive,
            ]}>
            {t('tab_map', 'Map')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Summary KPI Strip (Total Tests, Avg Download, Avg Upload, Avg Ping) */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{summary.total}</Text>
          <Text style={styles.summaryLabel}>{t('total_tests', 'Total Tests')}</Text>
        </View>

        <View style={styles.summaryDivider} />

        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>
            {summary.avgDown > 0 ? summary.avgDown : '--'}
          </Text>
          <Text style={styles.summaryLabel}>{t('avg_download', 'Avg Download')}</Text>
          <Text style={styles.summarySubLabel}>(Mbps)</Text>
        </View>

        <View style={styles.summaryDivider} />

        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>
            {summary.avgUp > 0 ? summary.avgUp : '--'}
          </Text>
          <Text style={styles.summaryLabel}>{t('avg_upload', 'Avg Upload')}</Text>
          <Text style={styles.summarySubLabel}>(Mbps)</Text>
        </View>

        <View style={styles.summaryDivider} />

        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>
            {summary.avgPing > 0 ? summary.avgPing : '--'}
          </Text>
          <Text style={styles.summaryLabel}>{t('avg_ping', 'Avg Ping')}</Text>
          <Text style={styles.summarySubLabel}>(ms)</Text>
        </View>
      </View>

      {/* Filter Section Container */}
      <View style={styles.filterSection}>
        {/* Test Type Filter Buttons: 2 rows properly aligned */}
        <View style={styles.testTypeGrid}>
          {/* Row 1: 3 equal buttons spanning full width */}
          <View style={styles.testTypeGridRow}>
            <TouchableOpacity
              style={[
                styles.testTypePill,
                selectedTestType === 'ALL' && styles.testTypePillActive,
              ]}
              onPress={() => setSelectedTestType('ALL')}
              activeOpacity={0.8}>
              <Text
                style={[
                  styles.testTypePillText,
                  selectedTestType === 'ALL' && styles.testTypePillTextActive,
                ]}
                numberOfLines={1}>
                {t('filter_all', 'All')} ({testTypeCounts.ALL})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.testTypePill,
                selectedTestType === 'SPEED' && styles.testTypePillActive,
              ]}
              onPress={() => setSelectedTestType('SPEED')}
              activeOpacity={0.8}>
              <LightningIcon
                size={13}
                color={selectedTestType === 'SPEED' ? '#FFFFFF' : '#00A389'}
              />
              <Text
                style={[
                  styles.testTypePillText,
                  selectedTestType === 'SPEED' && styles.testTypePillTextActive,
                ]}
                numberOfLines={1}>
                {t('filter_speed', 'Speed')} ({testTypeCounts.SPEED})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.testTypePill,
                selectedTestType === 'VIDEO' && styles.testTypePillActive,
              ]}
              onPress={() => setSelectedTestType('VIDEO')}
              activeOpacity={0.8}>
              <VideoBrowserTestIcon
                size={13}
                color={selectedTestType === 'VIDEO' ? '#FFFFFF' : '#4338CA'}
              />
              <Text
                style={[
                  styles.testTypePillText,
                  selectedTestType === 'VIDEO' && styles.testTypePillTextActive,
                ]}
                numberOfLines={1}>
                {t('filter_video', 'Video')} ({testTypeCounts.VIDEO})
              </Text>
            </TouchableOpacity>
          </View>

          {/* Row 2: 2 equal buttons spanning full width */}
          <View style={styles.testTypeGridRow}>
            <TouchableOpacity
              style={[
                styles.testTypePill,
                selectedTestType === 'COVERAGE' && styles.testTypePillActive,
              ]}
              onPress={() => setSelectedTestType('COVERAGE')}
              activeOpacity={0.8}>
              <CoverageTestIcon
                size={13}
                color={selectedTestType === 'COVERAGE' ? '#FFFFFF' : '#059669'}
              />
              <Text
                style={[
                  styles.testTypePillText,
                  selectedTestType === 'COVERAGE' && styles.testTypePillTextActive,
                ]}
                numberOfLines={1}>
                {t('filter_coverage', 'Coverage')} ({testTypeCounts.COVERAGE})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.testTypePill,
                selectedTestType === 'ADVANCE' && styles.testTypePillActive,
              ]}
              onPress={() => setSelectedTestType('ADVANCE')}
              activeOpacity={0.8}>
              <AdvanceTestsIcon
                size={13}
                color={selectedTestType === 'ADVANCE' ? '#FFFFFF' : '#D97706'}
              />
              <Text
                style={[
                  styles.testTypePillText,
                  selectedTestType === 'ADVANCE' && styles.testTypePillTextActive,
                ]}
                numberOfLines={1}>
                {t('filter_advance', 'Advance')} ({testTypeCounts.ADVANCE})
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Row 2: Secondary Dropdown Buttons (Operator & Test Mode) */}
        <View style={styles.dropdownButtonsRow}>
          {/* Operator Dropdown Button */}
          <TouchableOpacity
            style={[
              styles.dropdownTriggerBtn,
              selectedOperator !== 'ALL' && styles.dropdownTriggerBtnActive,
            ]}
            onPress={() =>
              setActiveDropdown(activeDropdown === 'operator' ? null : 'operator')
            }
            activeOpacity={0.8}>
            <Text style={styles.dropdownTriggerLabel}>{t('operator', 'Operator')}:</Text>
            <Text
              style={[
                styles.dropdownTriggerValue,
                selectedOperator !== 'ALL' && styles.dropdownTriggerValueActive,
              ]}
              numberOfLines={1}>
              {operatorLabel}
            </Text>
            {activeDropdown === 'operator' ? (
              <ChevronUpIcon size={14} color="#64748B" />
            ) : (
              <ChevronDownIcon size={14} color="#64748B" />
            )}
          </TouchableOpacity>

          {/* Test Mode Dropdown Button */}
          <TouchableOpacity
            style={[
              styles.dropdownTriggerBtn,
              selectedMode !== 'ALL' && styles.dropdownTriggerBtnActive,
            ]}
            onPress={() =>
              setActiveDropdown(activeDropdown === 'mode' ? null : 'mode')
            }
            activeOpacity={0.8}>
            <Text style={styles.dropdownTriggerLabel}>{t('test_mode', 'Test Mode')}:</Text>
            <Text
              style={[
                styles.dropdownTriggerValue,
                selectedMode !== 'ALL' && styles.dropdownTriggerValueActive,
              ]}
              numberOfLines={1}>
              {modeLabel}
            </Text>
            {activeDropdown === 'mode' ? (
              <ChevronUpIcon size={14} color="#64748B" />
            ) : (
              <ChevronDownIcon size={14} color="#64748B" />
            )}
          </TouchableOpacity>

          {/* Reset Filters Button (Visible when any filter is active) */}
          {hasActiveFilters && (
            <TouchableOpacity
              style={styles.resetFilterBtn}
              onPress={resetAllFilters}
              activeOpacity={0.7}>
              <CloseIcon size={13} color="#EF4444" />
              <Text style={styles.resetFilterBtnText}>{t('reset', 'Reset')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {viewMode === 'map' ? (
        <View style={styles.mapViewContainer}>
          <View style={styles.mapCard}>
            {/* Top Bar with Pin Count and Map/Satellite toggle */}
            <View style={styles.mapTopBar}>
              <View style={styles.mapPinsBadge}>
                <PinIcon size={13} color="#00A389" />
                <Text style={styles.mapPinsBadgeText}>
                  {mapMarkersData.length}{' '}
                  {mapMarkersData.length === 1 ? 'Test Pin' : 'Test Pins'}
                  {hasActiveFilters && ' (Filtered)'}
                </Text>
              </View>

              <View style={styles.mapTypeToggleRow}>
                <TouchableOpacity
                  style={[
                    styles.mapTypeToggleBtn,
                    historyMapType === 'map' && styles.mapTypeToggleBtnActive,
                  ]}
                  onPress={() => handleToggleHistoryMapType('map')}
                  activeOpacity={0.8}>
                  <Text
                    style={[
                      styles.mapTypeToggleText,
                      historyMapType === 'map' && styles.mapTypeToggleTextActive,
                    ]}>
                    Map
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.mapTypeToggleBtn,
                    historyMapType === 'satellite' && styles.mapTypeToggleBtnActive,
                  ]}
                  onPress={() => handleToggleHistoryMapType('satellite')}
                  activeOpacity={0.8}>
                  <Text
                    style={[
                      styles.mapTypeToggleText,
                      historyMapType === 'satellite' && styles.mapTypeToggleTextActive,
                    ]}>
                    Satellite
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* WebView Leaflet Map */}
            <WebView
              ref={mapWebViewRef}
              source={{ html: historyMapHtml }}
              style={styles.mapWebView}
              originWhitelist={['*']}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              scrollEnabled={false}
              bounces={false}
              onMessage={event => {
                try {
                  const data = JSON.parse(event.nativeEvent.data);
                  if (data.type === 'SELECT_SAMPLE' && data.id) {
                    const found = samples.find(s => s.id === data.id);
                    if (found) {
                      setSelectedSampleForDetail(found);
                    }
                  }
                } catch {
                  // ignore
                }
              }}
            />

            {/* Floating Action Controls on Right */}
            <View style={styles.mapControlsStack}>
              <TouchableOpacity
                style={styles.mapControlBtn}
                onPress={handleRecenterHistoryMap}
                activeOpacity={0.75}>
                <CrosshairIcon size={16} color="#0F172A" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.mapControlBtn}
                onPress={handleZoomInHistoryMap}
                activeOpacity={0.75}>
                <PlusIcon size={16} color="#0F172A" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.mapControlBtn}
                onPress={handleZoomOutHistoryMap}
                activeOpacity={0.75}>
                <MinusIcon size={16} color="#0F172A" />
              </TouchableOpacity>
            </View>

            {/* Bottom Speed Legend */}
            <View style={styles.mapLegendCard}>
              <View style={styles.mapLegendItem}>
                <View style={[styles.legendDot, styles.legendDotRed]} />
                <Text style={styles.legendText}>&lt;10M</Text>
              </View>
              <View style={styles.mapLegendItem}>
                <View style={[styles.legendDot, styles.legendDotAmber]} />
                <Text style={styles.legendText}>10-25M</Text>
              </View>
              <View style={styles.mapLegendItem}>
                <View style={[styles.legendDot, styles.legendDotTeal]} />
                <Text style={styles.legendText}>25-50M</Text>
              </View>
              <View style={styles.mapLegendItem}>
                <View style={[styles.legendDot, styles.legendDotGreen]} />
                <Text style={styles.legendText}>&gt;50M</Text>
              </View>
            </View>

            {/* Empty State Overlay */}
            {mapMarkersData.length === 0 && (
              <View style={styles.mapEmptyOverlay}>
                <Text style={styles.emptyIcon}>🔍</Text>
                <Text style={styles.mapEmptyTitle}>No Matching Tests Found</Text>
                <Text style={styles.mapEmptySubtitle}>
                  No test records match your selected filters.
                </Text>
                <TouchableOpacity style={styles.emptyResetBtn} onPress={resetAllFilters}>
                  <Text style={styles.emptyResetBtnText}>Clear All Filters</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      ) : (
        <>
          {/* Date Header Strip & Records Found Counter */}
          <View style={styles.dateHeaderRow}>
            <Text style={styles.dateHeaderText}>{latestDateLabel}</Text>
            <Text style={styles.recordCountText}>
              {filteredSamples.length} {filteredSamples.length === 1 ? 'Record' : 'Records'}
              {hasActiveFilters && ` of ${samples.length}`}
            </Text>
          </View>

          {/* Backend Retention Disclosure Banner */}
          <TouchableOpacity
            style={styles.retentionInfoStrip}
            activeOpacity={0.75}
            onPress={() => {
              Alert.alert(
                'Data Retention Policy',
                'NetSpeed QoS Monitor retains network measurement records on its backend for up to 90 days from the date they are recorded. Records older than this period are automatically deleted through our automated data-retention process.\n\nUsers may request deletion of their measurement records at any time by contacting privacy@hareandturtle.ai.',
                [
                  { text: 'Close', style: 'cancel' },
                  ...(onNavigateTab
                    ? [
                        {
                          text: 'Settings & Deletion',
                          onPress: () => onNavigateTab('SETTINGS'),
                        },
                      ]
                    : []),
                ]
              );
            }}>
            <Text style={styles.retentionInfoText}>
              ⏱️ Backend records auto-delete after 90 days • <Text style={styles.retentionInfoLink}>Policy Details</Text>
            </Text>
          </TouchableOpacity>

          {/* Capacity Strip Warning (if full) */}
          {capacityInfo.isFull && (
            <View style={styles.capacityWarning}>
              <Text style={styles.capacityWarningText}>
                ⚠️ Capacity reached ({capacityInfo.count}/{capacityInfo.maxLimit}). Auto-depleting oldest entries.
              </Text>
              <TouchableOpacity onPress={handleExportPrompt}>
                <Text style={styles.capacityExportLink}>Backup</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Main History Records List */}
          {filteredSamples.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🔍</Text>
              <Text style={styles.emptyTitle}>No Matching Tests Found</Text>
              <Text style={styles.emptySubtitle}>
                {hasActiveFilters
                  ? 'No test records matched your filter criteria. Try adjusting or clearing filters.'
                  : 'Run speed, video, or coverage tests to record telemetry metrics.'}
              </Text>
              {hasActiveFilters && (
                <TouchableOpacity style={styles.emptyResetBtn} onPress={resetAllFilters}>
                  <Text style={styles.emptyResetBtnText}>Clear All Filters</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <FlatList
              data={filteredSamples}
              keyExtractor={item => item.id}
              renderItem={renderItem}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
          )}
        </>
      )}

      {/* Bottom Action Footer */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.exportBtn, samples.length === 0 && styles.btnDisabled]}
          onPress={handleExportPrompt}
          disabled={samples.length === 0}>
          <Text style={styles.exportBtnText}>📤 {t('export_btn', 'Export CSV/JSON')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, styles.clearBtn, samples.length === 0 && styles.btnDisabled]}
          onPress={handleClearHistory}
          disabled={samples.length === 0}>
          <Text style={styles.clearBtnText}>🗑 {t('clear_btn', 'Clear')}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.actionBtn, styles.refreshBtn]} onPress={onRefresh}>
          <Text style={styles.refreshBtnText}>🔄 {t('refresh_btn', 'Refresh')}</Text>
        </TouchableOpacity>
      </View>

      {/* Floating Dropdown Modal for Operator & Test Mode */}
      {activeDropdown && (
        <TouchableWithoutFeedback onPress={() => setActiveDropdown(null)}>
          <View style={styles.dropdownModalBackdrop}>
            <TouchableWithoutFeedback>
              <View
                style={[
                  styles.dropdownCard,
                  activeDropdown === 'operator'
                    ? styles.dropdownCardOperator
                    : styles.dropdownCardMode,
                ]}>
                {activeDropdown === 'operator' ? (
                  <>
                    <Text style={styles.dropdownHeaderTitle}>Filter by Operator</Text>
                    {[
                      { id: 'ALL', label: 'All Operators' },
                      { id: 'AIRTEL', label: 'Airtel' },
                      { id: 'JIO', label: 'Jio' },
                      { id: 'VI', label: 'Vi (Vodafone Idea)' },
                      { id: 'BSNL', label: 'BSNL & MTNL' },
                    ].map(item => {
                      const isSelected = selectedOperator === item.id;
                      return (
                        <TouchableOpacity
                          key={item.id}
                          style={styles.dropdownOptionRow}
                          onPress={() => {
                            setSelectedOperator(item.id as OperatorFilter);
                            setActiveDropdown(null);
                          }}
                          activeOpacity={0.7}>
                          <View
                            style={[
                              styles.checkboxBox,
                              isSelected && styles.checkboxBoxSelected,
                            ]}>
                            {isSelected && <View style={styles.checkboxInnerCheck} />}
                          </View>
                          <Text
                            style={[
                              styles.dropdownOptionText,
                              isSelected && styles.dropdownOptionTextSelected,
                            ]}>
                            {item.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </>
                ) : (
                  <>
                    <Text style={styles.dropdownHeaderTitle}>Filter by Test Mode</Text>
                    {[
                      { id: 'ALL', label: 'All Modes (Wi-Fi & Mobile)' },
                      { id: 'WIFI', label: '🛜 Wi-Fi Only' },
                      { id: 'MOBILE_DATA', label: '📶 Mobile Data Only' },
                    ].map(item => {
                      const isSelected = selectedMode === item.id;
                      return (
                        <TouchableOpacity
                          key={item.id}
                          style={styles.dropdownOptionRow}
                          onPress={() => {
                            setSelectedMode(item.id as ModeFilter);
                            setActiveDropdown(null);
                          }}
                          activeOpacity={0.7}>
                          <View
                            style={[
                              styles.checkboxBox,
                              isSelected && styles.checkboxBoxSelected,
                            ]}>
                            {isSelected && <View style={styles.checkboxInnerCheck} />}
                          </View>
                          <Text
                            style={[
                              styles.dropdownOptionText,
                              isSelected && styles.dropdownOptionTextSelected,
                            ]}>
                            {item.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </>
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F6FA',
  },
  topSegmentedRow: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 24,
    padding: 3,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
  },
  segmentedTab: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  segmentedTabActive: {
    backgroundColor: '#00A389',
    shadowColor: '#00A389',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  segmentedTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  segmentedTabTextActive: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#E8EDF2',
    alignItems: 'center',
    justifyContent: 'space-around',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  summaryItem: {
    alignItems: 'center',
    flex: 1,
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    fontVariant: ['tabular-nums'],
  },
  summaryLabel: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
  },
  summarySubLabel: {
    fontSize: 8.5,
    color: '#94A3B8',
  },
  summaryDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#F1F5F9',
  },
  filterSection: {
    marginHorizontal: 16,
    marginBottom: 8,
  },
  testTypeGrid: {
    gap: 7,
    marginBottom: 7,
  },
  testTypeGridRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    width: '100%',
  },
  testTypePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingVertical: 7,
    paddingHorizontal: 6,
    gap: 4,
    height: 36,
  },
  testTypePillActive: {
    backgroundColor: '#00A389',
    borderColor: '#00A389',
    shadowColor: '#00A389',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 2,
  },
  testTypePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  testTypePillTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  dropdownButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dropdownTriggerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 10,
    height: 36,
  },
  dropdownTriggerBtnActive: {
    borderColor: '#00A389',
    backgroundColor: '#F0FDFA',
  },
  dropdownTriggerLabel: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
    marginRight: 4,
  },
  dropdownTriggerValue: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1E293B',
    flex: 1,
  },
  dropdownTriggerValueActive: {
    color: '#00A389',
  },
  resetFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    paddingHorizontal: 8,
    height: 36,
    gap: 3,
  },
  resetFilterBtnText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#EF4444',
  },
  dateHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 2,
    marginBottom: 6,
  },
  dateHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  recordCountText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
  },
  retentionInfoStrip: {
    backgroundColor: '#F8FAFC',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  retentionInfoText: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '500',
  },
  retentionInfoLink: {
    color: '#00A389',
    fontWeight: '700',
  },
  capacityWarning: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  capacityWarningText: {
    fontSize: 10.5,
    color: '#92400E',
    fontWeight: '600',
    flex: 1,
  },
  capacityExportLink: {
    fontSize: 11,
    fontWeight: '800',
    color: '#B45309',
    marginLeft: 6,
    textDecorationLine: 'underline',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  recordCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8EDF2',
    padding: 12,
    marginBottom: 8,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  timeAndTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
  },
  testTypeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  testTypeBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
    justifyContent: 'flex-end',
    marginRight: 6,
  },
  carrierPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  carrierPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  envPill: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  envPillText: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#64748B',
  },
  chevronBox: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronRotated: {
    transform: [{ rotate: '90deg' }],
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  metricItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metricVal: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    fontVariant: ['tabular-nums'],
  },
  metricUnit: {
    fontSize: 9,
    fontWeight: '600',
    color: '#94A3B8',
  },
  expandedDrawer: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    gap: 3,
  },
  expandedText: {
    fontSize: 11,
    color: '#64748B',
  },
  expandedBold: {
    fontWeight: '700',
    color: '#1E293B',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 40,
  },
  emptyIcon: {
    fontSize: 38,
    marginBottom: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },
  emptyResetBtn: {
    marginTop: 14,
    backgroundColor: '#00A389',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  emptyResetBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E8EDF2',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exportBtn: {
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
  },
  exportBtnText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#0F766E',
  },
  clearBtn: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  clearBtnText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#B91C1C',
  },
  refreshBtn: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  refreshBtnText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
  },
  btnDisabled: {
    opacity: 0.4,
  },
  dropdownModalBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
    zIndex: 100,
  },
  dropdownCard: {
    position: 'absolute',
    top: 215,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  dropdownCardOperator: {
    left: 16,
    width: 210,
  },
  dropdownCardMode: {
    right: 16,
    width: 220,
  },
  dropdownHeaderTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 6,
    marginLeft: 4,
  },
  dropdownOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  checkboxBox: {
    width: 17,
    height: 17,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#94A3B8',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  checkboxBoxSelected: {
    borderColor: '#00A389',
    backgroundColor: '#00A389',
  },
  checkboxInnerCheck: {
    width: 7,
    height: 7,
    borderRadius: 1.5,
    backgroundColor: '#FFFFFF',
  },
  dropdownOptionText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#334155',
  },
  dropdownOptionTextSelected: {
    color: '#0F172A',
    fontWeight: '800',
  },
  mapViewContainer: {
    flex: 1,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  mapCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    position: 'relative',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 3,
  },
  mapTopBar: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    pointerEvents: 'box-none',
  },
  mapPinsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  mapPinsBadgeText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  mapTypeToggleRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(241, 245, 249, 0.95)',
    borderRadius: 14,
    padding: 2,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  mapTypeToggleBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  mapTypeToggleBtnActive: {
    backgroundColor: '#00A389',
  },
  mapTypeToggleText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  mapTypeToggleTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  mapWebView: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  mapControlsStack: {
    position: 'absolute',
    right: 10,
    bottom: 50,
    zIndex: 10,
    gap: 6,
  },
  mapControlBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  mapLegendCard: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  mapLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendDotRed: {
    backgroundColor: '#EF4444',
  },
  legendDotAmber: {
    backgroundColor: '#F59E0B',
  },
  legendDotTeal: {
    backgroundColor: '#00A389',
  },
  legendDotGreen: {
    backgroundColor: '#10B981',
  },
  legendText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  mapEmptyOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    zIndex: 20,
  },
  mapEmptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 8,
  },
  mapEmptySubtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 12,
  },
});
