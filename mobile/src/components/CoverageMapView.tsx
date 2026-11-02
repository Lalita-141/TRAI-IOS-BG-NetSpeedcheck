import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  TouchableWithoutFeedback,
  ActivityIndicator,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Sample } from '../types';
import { getConfig } from '../config';
import {
  SearchIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CrosshairIcon,
  PlusIcon,
  MinusIcon,
  CloseIcon,
} from './Icons';

interface CoverageMapViewProps {
  samples: Sample[];
  currentLocation?: { lat: number | null; lng: number | null } | null;
  onRefresh?: () => void;
  onNavigateHistory?: () => void;
}

type MetricType = 'Coverage' | 'Download' | 'Upload' | 'Latency';
type TechnologyType = 'All' | '5G' | '4G' | '2G';
type OperatorType = 'All' | 'Airtel' | 'BSNL & MTNL' | 'Jio' | 'Vi' | 'WIFI';
type DropdownType = 'metric' | 'technology' | 'operator' | null;
type MapType = 'map' | 'satellite';

const METRIC_OPTIONS: MetricType[] = ['Coverage', 'Download', 'Upload', 'Latency'];
const TECH_OPTIONS: TechnologyType[] = ['All', '5G', '4G', '2G'];
const OPERATOR_OPTIONS: OperatorType[] = ['All', 'Airtel', 'BSNL & MTNL', 'Jio', 'Vi', 'WIFI'];

// Common city centers for zero-latency instant jump
const PRESET_CITIES: Record<string, { lat: number; lng: number }> = {
  pune: { lat: 18.5204, lng: 73.8567 },
  'pimpri-chinchwad': { lat: 18.6298, lng: 73.7997 },
  pimpri: { lat: 18.6298, lng: 73.7997 },
  chakan: { lat: 18.7606, lng: 73.858 },
  hinjewadi: { lat: 18.5913, lng: 73.7389 },
  hadapsar: { lat: 18.5089, lng: 73.926 },
  mumbai: { lat: 19.076, lng: 72.8777 },
  delhi: { lat: 28.6139, lng: 77.209 },
  bengaluru: { lat: 12.9716, lng: 77.5946 },
  bangalore: { lat: 12.9716, lng: 77.5946 },
  hyderabad: { lat: 17.385, lng: 78.4867 },
  chennai: { lat: 13.0827, lng: 80.2707 },
  kolkata: { lat: 22.5726, lng: 88.3639 },
  ahmedabad: { lat: 23.0225, lng: 72.5714 },
  nagpur: { lat: 21.1458, lng: 79.0882 },
  nashik: { lat: 19.9975, lng: 73.7898 },
  saswad: { lat: 18.3444, lng: 74.0308 },
};

export const CoverageMapView: React.FC<CoverageMapViewProps> = ({
  samples,
  currentLocation,
  onRefresh,
}) => {
  const webViewRef = useRef<any>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMetric, setSelectedMetric] = useState<MetricType>('Coverage');
  const [selectedTech, setSelectedTech] = useState<TechnologyType>('All');
  const [selectedOperator, setSelectedOperator] = useState<OperatorType>('All');
  const [activeDropdown, setActiveDropdown] = useState<DropdownType>(null);
  const [mapType, setMapType] = useState<MapType>('map');
  const [isSearching, setIsSearching] = useState(false);
  const [crowdsourcedSamples, setCrowdsourcedSamples] = useState<any[]>([]);
  const [isLiveLoading, setIsLiveLoading] = useState(false);

  // Fetch live crowdsourced samples from backend MySQL DB (/v1/crowdsource/map)
  const fetchCrowdsourcedData = useCallback(
    async (
      operator: OperatorType = selectedOperator,
      tech: TechnologyType = selectedTech,
      metric: MetricType = selectedMetric
    ) => {
      try {
        setIsLiveLoading(true);
        const config = await getConfig();
        const serverUrl = config.serverUrl.replace(/\/+$/, '');

        const opQuery =
          operator === 'BSNL & MTNL'
            ? 'BSNL'
            : operator === 'WIFI'
            ? 'wifi'
            : operator;

        const params = new URLSearchParams({
          operator: opQuery,
          technology: tech,
          metric: metric,
          limit: '1000',
        });

        const res = await fetch(`${serverUrl}/v1/crowdsource/map?${params.toString()}`, {
          headers: { Accept: 'application/json' },
        });

        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            const mapped = data.map((d: any) => ({
              id: d.id,
              lat: d.lat,
              lng: d.lng,
              down: d.down_mbps ?? null,
              up: d.up_mbps ?? null,
              ping: d.latency_ms ?? null,
              signal: d.signal_dbm ?? null,
              network: d.network ?? null,
              carrier: d.carrier ?? null,
              tech: d.radio ?? null,
              ts: d.ts,
              rating: d.rating,
              color: d.color,
              isCrowdsourced: true,
            }));
            setCrowdsourcedSamples(mapped);

            // Dynamically inject into WebView without reloading
            webViewRef.current?.injectJavaScript(
              `if (window.updateCrowdsourceSamples) { window.updateCrowdsourceSamples(${JSON.stringify(
                mapped
              )}); } true;`
            );
          }
        }
      } catch (err) {
        console.warn('[CoverageMapView] Failed to fetch live crowdsourced map points:', err);
      } finally {
        setIsLiveLoading(false);
      }
    },
    [selectedOperator, selectedTech, selectedMetric]
  );

  // Fetch live crowdsource points on mount
  useEffect(() => {
    fetchCrowdsourcedData();
  }, [fetchCrowdsourcedData]);

  // Compute map center
  const defaultCenter = useMemo(() => {
    if (currentLocation?.lat && currentLocation?.lng) {
      return { lat: currentLocation.lat, lng: currentLocation.lng };
    }
    const sampleWithCoords = samples.find(s => s.lat != null && s.lng != null);
    if (sampleWithCoords && sampleWithCoords.lat && sampleWithCoords.lng) {
      return { lat: sampleWithCoords.lat, lng: sampleWithCoords.lng };
    }
    return { lat: 18.5204, lng: 73.8567 }; // Pune default
  }, [currentLocation, samples]);

  // Valid samples with coordinates
  const validSamples = useMemo(
    () =>
      samples
        .filter(s => s.lat != null && s.lng != null)
        .map(s => ({
          id: s.id,
          lat: s.lat!,
          lng: s.lng!,
          down: s.down_mbps ?? null,
          up: s.up_mbps ?? null,
          ping: s.latency_ms ?? null,
          signal: s.signal_dbm ?? null,
          network: s.network ?? null,
          carrier: s.carrier ?? null,
          tech: s.radio ?? null,
          ts: s.ts,
        })),
    [samples]
  );

  // Combine local device test samples with server crowdsourced test samples
  const allSamples = useMemo(() => {
    // This device's tests are on the server too: don't count them twice
    const localIds = new Set(validSamples.map(s => s.id));
    return [...validSamples, ...crowdsourcedSamples.filter(s => !localIds.has(s.id))];
  }, [validSamples, crowdsourcedSamples]);

  // Handle Search Location
  const handleSearch = useCallback(async () => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return;

    // Check presets first
    if (PRESET_CITIES[query]) {
      const { lat, lng } = PRESET_CITIES[query];
      webViewRef.current?.injectJavaScript(`window.flyToLocation(${lat}, ${lng}, 12); true;`);
      return;
    }

    // Dynamic Geocoding via Server Proxy (with Nominatim fallback)
    setIsSearching(true);
    try {
      const config = await getConfig();
      const serverUrl = config.serverUrl.replace(/\/+$/, '');
      const response = await fetch(
        `${serverUrl}/v1/locations/search?q=${encodeURIComponent(searchQuery)}`,
        { headers: { Accept: 'application/json' } }
      );
      if (response.ok) {
        const results = await response.json();
        if (Array.isArray(results) && results.length > 0) {
          const { lat, lng: lon } = results[0];
          webViewRef.current?.injectJavaScript(`window.flyToLocation(${lat}, ${lon}, 12); true;`);
          return;
        }
      }
    } catch {
      // Backend proxy unavailable, proceed to direct fallback
    }

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          searchQuery
        )}&countrycodes=in&limit=1`,
        {
          headers: {
            'User-Agent': 'TraiNetSpeedcheckApp/1.0',
          },
        }
      );
      const data = await response.json();
      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lon = parseFloat(data[0].lon);
        webViewRef.current?.injectJavaScript(`window.flyToLocation(${lat}, ${lon}, 12); true;`);
      }
    } catch {
      // ignore
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery]);

  // Handle Map Type Toggle
  const handleToggleMapType = (type: MapType) => {
    setMapType(type);
    webViewRef.current?.injectJavaScript(`window.setMapType('${type}'); true;`);
  };

  // Handle Map Controls
  const handleRecenter = () => {
    webViewRef.current?.injectJavaScript(
      `window.flyToLocation(${defaultCenter.lat}, ${defaultCenter.lng}, 12); true;`
    );
    fetchCrowdsourcedData();
    if (onRefresh) onRefresh();
  };

  const handleZoomIn = () => {
    webViewRef.current?.injectJavaScript('window.zoomIn(); true;');
  };

  const handleZoomOut = () => {
    webViewRef.current?.injectJavaScript('window.zoomOut(); true;');
  };

  // Push filter update to WebView and trigger crowdsource fetch
  const handleSelectOption = (type: DropdownType, option: string) => {
    let newMetric = selectedMetric;
    let newTech = selectedTech;
    let newOp = selectedOperator;

    if (type === 'metric') {
      newMetric = option as MetricType;
      setSelectedMetric(newMetric);
    } else if (type === 'technology') {
      newTech = option as TechnologyType;
      setSelectedTech(newTech);
    } else if (type === 'operator') {
      newOp = option as OperatorType;
      setSelectedOperator(newOp);
    }

    webViewRef.current?.injectJavaScript(
      `window.updateFilters('${newOp}', '${newTech}', '${newMetric}'); true;`
    );
    fetchCrowdsourcedData(newOp, newTech, newMetric);
    setActiveDropdown(null);
  };

  // Generate Leaflet Map HTML
  const mapHtml = useMemo(() => {
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

    /* Custom Leaflet Light Popup */
    .leaflet-popup-content-wrapper {
      background: #FFFFFF !important;
      color: #0F172A !important;
      border: 1px solid #E2E8F0 !important;
      border-radius: 14px !important;
      padding: 0 !important;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.18) !important;
    }
    .leaflet-popup-tip {
      background: #FFFFFF !important;
      border: 1px solid #E2E8F0 !important;
    }
    .popup-container {
      padding: 12px 14px;
      min-width: 170px;
    }
    .popup-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid #E2E8F0;
      padding-bottom: 8px;
      margin-bottom: 8px;
    }
    .popup-title {
      font-size: 13px;
      font-weight: 800;
      color: #0F172A;
      letter-spacing: -0.2px;
    }
    .popup-badge {
      display: inline-block;
      padding: 2px 7px;
      border-radius: 6px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .badge-excellent { background: rgba(16, 185, 129, 0.15); color: #059669; border: 1px solid rgba(16, 185, 129, 0.35); }
    .badge-better { background: rgba(20, 184, 166, 0.15); color: #0D9488; border: 1px solid rgba(20, 184, 166, 0.35); }
    .badge-good { background: rgba(245, 158, 11, 0.15); color: #D97706; border: 1px solid rgba(245, 158, 11, 0.35); }
    .badge-poor { background: rgba(239, 68, 68, 0.15); color: #DC2626; border: 1px solid rgba(239, 68, 68, 0.35); }

    .popup-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      color: #64748B;
      margin: 4px 0;
    }
    .popup-val {
      font-weight: 700;
      color: #0F172A;
    }
    .popup-op {
      font-size: 11px;
      font-weight: 600;
      color: #00A389;
      margin-top: 4px;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .leaflet-container .leaflet-control-attribution {
      background: rgba(255, 255, 255, 0.85) !important;
      color: #475569 !important;
      font-size: 9px !important;
      padding: 2px 6px !important;
      border-radius: 4px !important;
      margin-left: 10px !important;
      margin-bottom: 6px !important;
    }
    .leaflet-container .leaflet-control-attribution a {
      color: #0284C7 !important;
      text-decoration: none !important;
    }
    .badge-none { background: #F1F5F9; color: #64748B; }
    #no-data {
      display: none;
      position: absolute;
      top: 12px;
      left: 12px;
      right: 12px;
      z-index: 500;
      padding: 10px 12px;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.95);
      color: #334155;
      font-size: 12px;
      font-weight: 600;
      text-align: center;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <div id="no-data">No tests recorded for this selection yet. Coverage appears here as real tests are run.</div>

  <script>
    var centerLat = ${defaultCenter.lat};
    var centerLng = ${defaultCenter.lng};
    var currentOperator = '${selectedOperator}';
    var currentTech = '${selectedTech}';
    var currentMetric = '${selectedMetric}';
    var userSamples = ${JSON.stringify(allSamples)};

    // Initialize Leaflet Map
    var map = L.map('map', {
      zoomControl: false,
      attributionControl: true,
      minZoom: 4,
      maxZoom: 18
    }).setView([centerLat, centerLng], 11);

    // Tile layers (Light Theme: Esri World Street Map - Completely free, no API key needed)
    var lightLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: '&copy; Esri &mdash; Street Map'
    }).addTo(map);

    var satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: '&copy; Esri World Imagery'
    });

    window.setMapType = function(type) {
      if (type === 'satellite') {
        map.removeLayer(lightLayer);
        satelliteLayer.addTo(map);
      } else {
        map.removeLayer(satelliteLayer);
        lightLayer.addTo(map);
      }
    };

    window.zoomIn = function() { map.zoomIn(); };
    window.zoomOut = function() { map.zoomOut(); };
    window.flyToLocation = function(lat, lng, zoom) {
      map.flyTo([lat, lng], zoom || 11, { duration: 1.2 });
      centerLat = lat;
      centerLng = lng;
    };

    // Hexagon Layer Group
    var hexagonLayerGroup = L.featureGroup().addTo(map);
    var sampleMarkerGroup = L.featureGroup().addTo(map);

    // Color definitions
    var COLOR_EXCELLENT = '#10B981';
    var COLOR_BETTER = '#14B8A6';
    var COLOR_GOOD = '#F59E0B';
    var COLOR_POOR = '#EF4444';

    // Mathematical pointy-topped hexagon vertices
    function getHexagonVertices(lat, lng, radiusDeg) {
      var coords = [];
      var latScale = Math.cos(lat * Math.PI / 180);
      for (var i = 0; i < 6; i++) {
        var angleDeg = 60 * i - 30;
        var angleRad = Math.PI / 180 * angleDeg;
        var pLat = lat + radiusDeg * Math.sin(angleRad);
        var pLng = lng + (radiusDeg / latScale) * Math.cos(angleRad);
        coords.push([pLat, pLng]);
      }
      return coords;
    }

    var COLOR_NONE = '#94A3B8';

    // Crowdsourced points are already filtered by the server; this device's own tests are filtered here
    function matchesFilters(s) {
      if (s.isCrowdsourced) return true;
      var carrier = (s.carrier || '').toLowerCase();
      if (currentOperator === 'WIFI') {
        if (s.network !== 'wifi') return false;
      } else if (currentOperator === 'BSNL & MTNL') {
        if (carrier.indexOf('bsnl') < 0 && carrier.indexOf('mtnl') < 0) return false;
      } else if (currentOperator !== 'All') {
        if (carrier.indexOf(currentOperator.toLowerCase()) < 0) return false;
      }
      if (currentTech !== 'All' && (s.tech || '').indexOf(currentTech) < 0) return false;
      return true;
    }

    function metricValue(s) {
      if (currentMetric === 'Download') return s.down;
      if (currentMetric === 'Upload') return s.up;
      if (currentMetric === 'Latency') return s.ping;
      return s.signal;
    }

    // 3 = Excellent ... 0 = Poor, null = this test did not measure the metric
    function scoreOf(s) {
      var v = metricValue(s);
      if (v == null) return null;
      var limits;
      if (currentMetric === 'Latency') {
        return v < 25 ? 3 : v < 50 ? 2 : v < 100 ? 1 : 0;
      } else if (currentMetric === 'Download') {
        limits = [50, 25, 10];
      } else if (currentMetric === 'Upload') {
        limits = [20, 10, 5];
      } else {
        // Wi-Fi RSSI and cellular signal use different scales
        limits = s.network === 'wifi' ? [-55, -67, -75] : [-85, -95, -105];
      }
      return v >= limits[0] ? 3 : v >= limits[1] ? 2 : v >= limits[2] ? 1 : 0;
    }

    function ratingOf(score) {
      if (score == null) return { rating: 'No signal data', color: COLOR_NONE, badge: 'badge-none' };
      if (score >= 2.5) return { rating: 'Excellent', color: COLOR_EXCELLENT, badge: 'badge-excellent' };
      if (score >= 1.5) return { rating: 'Better', color: COLOR_BETTER, badge: 'badge-better' };
      if (score >= 0.5) return { rating: 'Good', color: COLOR_GOOD, badge: 'badge-good' };
      return { rating: 'Poor', color: COLOR_POOR, badge: 'badge-poor' };
    }

    // Coverage shows every real test (a test without dBm is still real service data);
    // a speed metric only shows tests that measured that speed.
    function visibleSamples() {
      return userSamples.filter(function(s) {
        return matchesFilters(s) && (currentMetric === 'Coverage' || metricValue(s) != null);
      });
    }

    function average(list, field, digits) {
      var nums = list.map(function(s) { return s[field]; }).filter(function(v) { return v != null; });
      if (nums.length === 0) return '--';
      var sum = nums.reduce(function(a, b) { return a + b; }, 0);
      return (sum / nums.length).toFixed(digits);
    }

    function popupRow(label, value) {
      return '<div class="popup-row"><span>' + label + '</span><span class="popup-val">' + value + '</span></div>';
    }

    // One hexagon per area that has real tests. Areas without tests stay empty.
    function renderHexagons() {
      hexagonLayerGroup.clearLayers();

      var r = 0.015; // hexagon radius ~1.5km
      var deltaLat = 1.5 * r;
      var cells = {};
      var visible = visibleSamples();

      visible.forEach(function(s) {
        var row = Math.round(s.lat / deltaLat);
        var hLat = row * deltaLat;
        var deltaLng = Math.sqrt(3) * r / Math.cos(hLat * Math.PI / 180);
        var colOffset = (Math.abs(row) % 2 === 1) ? (deltaLng / 2) : 0;
        var col = Math.round((s.lng - colOffset) / deltaLng);
        var key = row + '_' + col;
        if (!cells[key]) cells[key] = { lat: hLat, lng: col * deltaLng + colOffset, samples: [] };
        cells[key].samples.push(s);
      });

      document.getElementById('no-data').style.display = visible.length === 0 ? 'block' : 'none';

      Object.keys(cells).forEach(function(key) {
        var cell = cells[key];
        var scores = cell.samples.map(scoreOf).filter(function(v) { return v != null; });
        var meanScore = scores.length === 0 ? null : scores.reduce(function(a, b) { return a + b; }, 0) / scores.length;
        var result = ratingOf(meanScore);

        var polygon = L.polygon(getHexagonVertices(cell.lat, cell.lng, r), {
          color: '#FFFFFF',
          weight: 1.5,
          opacity: 0.95,
          fillColor: result.color,
          fillOpacity: 0.72,
          smoothFactor: 1
        });

        var hasCrowd = cell.samples.some(function(s) { return s.isCrowdsourced; });
        var popupContent =
          '<div class="popup-container">' +
            '<div class="popup-header">' +
              '<span class="popup-title">' + currentOperator + ' Coverage</span>' +
              '<span class="popup-badge ' + result.badge + '">' + result.rating + '</span>' +
            '</div>' +
            popupRow('Avg Signal:', average(cell.samples, 'signal', 0) + ' dBm') +
            popupRow('Avg Download:', average(cell.samples, 'down', 1) + ' Mbps') +
            popupRow('Avg Upload:', average(cell.samples, 'up', 1) + ' Mbps') +
            popupRow('Avg Latency:', average(cell.samples, 'ping', 0) + ' ms') +
            popupRow('Tests here:', cell.samples.length) +
            '<div class="popup-op"><span>&#9679;</span> ' + (hasCrowd ? 'Crowdsourced tests' : 'My tests') + '</div>' +
          '</div>';

        polygon.bindPopup(popupContent, { maxWidth: 240, closeButton: false });
        hexagonLayerGroup.addLayer(polygon);
      });
    }

    // Render each real test as a pinpoint marker
    function renderUserSamplePins() {
      sampleMarkerGroup.clearLayers();
      visibleSamples().forEach(function(s) {
        var result = ratingOf(scoreOf(s));

        var circle = L.circleMarker([s.lat, s.lng], {
          radius: 6,
          fillColor: result.color,
          color: '#FFFFFF',
          weight: 2,
          opacity: 1,
          fillOpacity: 1
        });

        var fmt = function(v, digits, unit) { return v == null ? '--' : v.toFixed(digits) + unit; };
        var pop =
          '<div class="popup-container">' +
            '<div class="popup-header">' +
              '<span class="popup-title">' + (s.isCrowdsourced ? 'Crowdsourced Test' : 'My Test') + '</span>' +
              '<span class="popup-badge ' + result.badge + '">' + result.rating + '</span>' +
            '</div>' +
            popupRow('Signal:', fmt(s.signal, 0, ' dBm')) +
            popupRow('Download:', fmt(s.down, 1, ' Mbps')) +
            popupRow('Upload:', fmt(s.up, 1, ' Mbps')) +
            popupRow('Ping:', fmt(s.ping, 0, ' ms')) +
            popupRow('Carrier:', s.carrier || '--') +
          '</div>';

        circle.bindPopup(pop, { closeButton: false });
        sampleMarkerGroup.addLayer(circle);
      });
    }

    // Dynamic update for cloud crowdsource data without reloading webview
    window.updateCrowdsourceSamples = function(newSamples) {
      if (Array.isArray(newSamples)) {
        var localPersonal = userSamples.filter(function(s) { return !s.isCrowdsourced; });
        var localIds = {};
        localPersonal.forEach(function(s) { localIds[s.id] = true; });
        userSamples = localPersonal.concat(newSamples.filter(function(s) { return !localIds[s.id]; }));
        renderHexagons();
        renderUserSamplePins();
      }
    };

    // Dynamic Filter Handler (called from React Native without reloading)
    window.updateFilters = function(operator, tech, metric) {
      currentOperator = operator;
      currentTech = tech;
      currentMetric = metric;
      renderHexagons();
      renderUserSamplePins();
    };

    // Initial render
    renderHexagons();
    renderUserSamplePins();
  </script>
</body>
</html>
    `;
  }, [defaultCenter, selectedOperator, selectedTech, selectedMetric, allSamples]);

  return (
    <View style={styles.container}>
      {/* 1. Map Title & Live Cloud Status */}
      <View style={styles.headerRow}>
        <Text style={styles.screenTitle}>Map</Text>
        {crowdsourcedSamples.length > 0 && (
          <View style={styles.liveCloudBadge}>
            <View style={styles.liveCloudDot} />
            <Text style={styles.liveCloudText}>
              {crowdsourcedSamples.length} Live Cloud Tests
            </Text>
          </View>
        )}
      </View>

      {/* 2. Search Bar */}
      <View style={styles.searchContainer}>
        <SearchIcon size={18} color="#64748B" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search for location..."
          placeholderTextColor="#94A3B8"
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {isSearching ? (
          <ActivityIndicator size="small" color="#00A389" />
        ) : searchQuery.length > 0 ? (
          <TouchableOpacity
            onPress={() => setSearchQuery('')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <CloseIcon size={16} color="#64748B" />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* 3. Filter Pills Row: Metric, Technology, Operator */}
      <View style={styles.filtersRow}>
        {/* Metric Filter */}
        <View style={styles.filterCol}>
          <Text style={styles.filterLabel}>Metric</Text>
          <TouchableOpacity
            style={[styles.filterPill, activeDropdown === 'metric' && styles.filterPillActive]}
            onPress={() => setActiveDropdown(activeDropdown === 'metric' ? null : 'metric')}
            activeOpacity={0.8}>
            <Text style={styles.filterPillText} numberOfLines={1}>
              {selectedMetric}
            </Text>
            {activeDropdown === 'metric' ? (
              <ChevronUpIcon size={14} color="#64748B" />
            ) : (
              <ChevronDownIcon size={14} color="#64748B" />
            )}
          </TouchableOpacity>
        </View>

        {/* Technology Filter */}
        <View style={styles.filterCol}>
          <Text style={styles.filterLabel}>Technology</Text>
          <TouchableOpacity
            style={[styles.filterPill, activeDropdown === 'technology' && styles.filterPillActive]}
            onPress={() => setActiveDropdown(activeDropdown === 'technology' ? null : 'technology')}
            activeOpacity={0.8}>
            <Text style={styles.filterPillText} numberOfLines={1}>
              {selectedTech}
            </Text>
            {activeDropdown === 'technology' ? (
              <ChevronUpIcon size={14} color="#64748B" />
            ) : (
              <ChevronDownIcon size={14} color="#64748B" />
            )}
          </TouchableOpacity>
        </View>

        {/* Operator Filter */}
        <View style={styles.filterCol}>
          <Text style={styles.filterLabel}>Operator</Text>
          <TouchableOpacity
            style={[styles.filterPill, activeDropdown === 'operator' && styles.filterPillActive]}
            onPress={() => setActiveDropdown(activeDropdown === 'operator' ? null : 'operator')}
            activeOpacity={0.8}>
            <Text style={styles.filterPillText} numberOfLines={1}>
              {selectedOperator}
            </Text>
            {activeDropdown === 'operator' ? (
              <ChevronUpIcon size={14} color="#64748B" />
            ) : (
              <ChevronDownIcon size={14} color="#64748B" />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* 4. Map Container (WebView with Leaflet) */}
      <View style={styles.mapCard}>
        <WebView
          ref={webViewRef}
          originWhitelist={['*']}
          source={{ html: mapHtml }}
          style={styles.webview}
          startInLoadingState
          javaScriptEnabled
          domStorageEnabled
          renderLoading={() => (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#00A389" />
              <Text style={styles.loadingText}>Rendering Coverage Heatmap...</Text>
            </View>
          )}
        />

        {/* Map Type Segmented Control (Top-Left on Map: [ Map | Satellite ]) */}
        <View style={styles.mapTypeControl}>
          <TouchableOpacity
            style={[styles.mapTypeBtn, mapType === 'map' && styles.mapTypeBtnActive]}
            onPress={() => handleToggleMapType('map')}
            activeOpacity={0.8}>
            <Text style={[styles.mapTypeText, mapType === 'map' && styles.mapTypeTextActive]}>
              Map
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.mapTypeBtn, mapType === 'satellite' && styles.mapTypeBtnActive]}
            onPress={() => handleToggleMapType('satellite')}
            activeOpacity={0.8}>
            <Text
              style={[styles.mapTypeText, mapType === 'satellite' && styles.mapTypeTextActive]}>
              Satellite
            </Text>
          </TouchableOpacity>
        </View>

        {/* Floating Controls on Bottom-Right: Recenter & Zoom (+ / -) */}
        <View style={styles.mapControlsStack}>
          {/* Recenter / GPS Button */}
          <TouchableOpacity
            style={styles.controlCircleBtn}
            onPress={handleRecenter}
            activeOpacity={0.8}>
            <CrosshairIcon size={20} color="#0F172A" />
          </TouchableOpacity>

          {/* Zoom Buttons Stack */}
          <View style={styles.zoomStackContainer}>
            <TouchableOpacity style={styles.zoomBtn} onPress={handleZoomIn} activeOpacity={0.7}>
              <PlusIcon size={16} color="#0F172A" />
            </TouchableOpacity>
            <View style={styles.zoomDivider}>
              <View style={styles.zoomDot} />
            </View>
            <TouchableOpacity style={styles.zoomBtn} onPress={handleZoomOut} activeOpacity={0.7}>
              <MinusIcon size={16} color="#0F172A" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* 5. Bottom Legend Strip (Matching Screenshot: Excellent, Better, Good, Poor) */}
      <View style={styles.legendStrip}>
        <View style={styles.legendPill}>
          <Text style={styles.legendPillText}>Excellent</Text>
          <View style={[styles.legendDot, styles.dotExcellent]} />
        </View>

        <View style={styles.legendPill}>
          <Text style={styles.legendPillText}>Better</Text>
          <View style={[styles.legendDot, styles.dotBetter]} />
        </View>

        <View style={styles.legendPill}>
          <Text style={styles.legendPillText}>Good</Text>
          <View style={[styles.legendDot, styles.dotGood]} />
        </View>

        <View style={styles.legendPill}>
          <Text style={styles.legendPillText}>Poor</Text>
          <View style={[styles.legendDot, styles.dotPoor]} />
        </View>

        <View style={styles.legendPill}>
          <Text style={styles.legendPillText}>No dBm</Text>
          <View style={[styles.legendDot, styles.dotNone]} />
        </View>
      </View>

      {/* 6. Floating Dropdown Modals (Aligned below respective filter pill) */}
      {activeDropdown && (
        <TouchableWithoutFeedback onPress={() => setActiveDropdown(null)}>
          <View style={styles.dropdownOverlay}>
            <TouchableWithoutFeedback>
              <View
                style={[
                  styles.dropdownCard,
                  activeDropdown === 'metric' && styles.dropdownCardLeft,
                  activeDropdown === 'technology' && styles.dropdownCardCenter,
                  activeDropdown === 'operator' && styles.dropdownCardRight,
                ]}>
                {activeDropdown === 'metric' &&
                  METRIC_OPTIONS.map(opt => {
                    const isSelected = selectedMetric === opt;
                    return (
                      <TouchableOpacity
                        key={opt}
                        style={styles.dropdownItemRow}
                        onPress={() => handleSelectOption('metric', opt)}
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
                            styles.dropdownItemText,
                            isSelected && styles.dropdownItemTextSelected,
                          ]}>
                          {opt}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}

                {activeDropdown === 'technology' &&
                  TECH_OPTIONS.map(opt => {
                    const isSelected = selectedTech === opt;
                    return (
                      <TouchableOpacity
                        key={opt}
                        style={styles.dropdownItemRow}
                        onPress={() => handleSelectOption('technology', opt)}
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
                            styles.dropdownItemText,
                            isSelected && styles.dropdownItemTextSelected,
                          ]}>
                          {opt}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}

                {activeDropdown === 'operator' &&
                  OPERATOR_OPTIONS.map(opt => {
                    const isSelected = selectedOperator === opt;
                    return (
                      <TouchableOpacity
                        key={opt}
                        style={styles.dropdownItemRow}
                        onPress={() => handleSelectOption('operator', opt)}
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
                            styles.dropdownItemText,
                            isSelected && styles.dropdownItemTextSelected,
                          ]}>
                          {opt}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
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
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
    position: 'relative',
  },
  headerRow: {
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  liveCloudBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 14,
  },
  liveCloudDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginRight: 6,
  },
  liveCloudText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#065F46',
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 22,
    paddingHorizontal: 14,
    height: 42,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    marginLeft: 8,
    paddingVertical: 0,
  },
  filtersRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 12,
  },
  filterCol: {
    flex: 1,
  },
  filterLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 4,
    marginLeft: 2,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 20,
    paddingHorizontal: 12,
    height: 38,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  filterPillActive: {
    borderColor: '#00A389',
    backgroundColor: '#E6F8F5',
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
    flex: 1,
    marginRight: 4,
  },
  mapCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  webview: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  loadingContainer: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 10,
  },
  mapTypeControl: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 8,
    padding: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 10,
  },
  mapTypeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
  },
  mapTypeBtnActive: {
    backgroundColor: '#E6F8F5',
  },
  mapTypeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  mapTypeTextActive: {
    color: '#00A389',
    fontWeight: '800',
  },
  mapControlsStack: {
    position: 'absolute',
    bottom: 16,
    right: 14,
    alignItems: 'center',
    gap: 10,
    zIndex: 10,
  },
  controlCircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  zoomStackContainer: {
    width: 38,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  zoomBtn: {
    width: 38,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomDivider: {
    width: '100%',
    height: 1,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#F59E0B',
  },
  legendStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
    marginTop: 10,
    marginBottom: 4,
  },
  legendPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 18,
    paddingVertical: 7,
    paddingHorizontal: 6,
    gap: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  legendPillText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#334155',
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  dotExcellent: {
    backgroundColor: '#10B981',
  },
  dotBetter: {
    backgroundColor: '#14B8A6',
  },
  dotGood: {
    backgroundColor: '#F59E0B',
  },
  dotPoor: {
    backgroundColor: '#EF4444',
  },
  dotNone: {
    backgroundColor: '#94A3B8',
  },
  dropdownOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    zIndex: 100,
  },
  dropdownCard: {
    position: 'absolute',
    top: 130,
    width: 175,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  dropdownCardLeft: {
    left: 16,
  },
  dropdownCardCenter: {
    alignSelf: 'center',
  },
  dropdownCardRight: {
    right: 16,
  },
  dropdownItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
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
  dropdownItemText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  dropdownItemTextSelected: {
    color: '#0F172A',
    fontWeight: '800',
  },
});
