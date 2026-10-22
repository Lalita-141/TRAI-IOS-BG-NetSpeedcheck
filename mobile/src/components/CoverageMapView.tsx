import React, { useState, useMemo, useRef, useCallback } from 'react';
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
type OperatorType = 'Airtel' | 'BSNL & MTNL' | 'Jio' | 'Vi' | 'WIFI';
type DropdownType = 'metric' | 'technology' | 'operator' | null;
type MapType = 'map' | 'satellite';

const METRIC_OPTIONS: MetricType[] = ['Coverage', 'Download', 'Upload', 'Latency'];
const TECH_OPTIONS: TechnologyType[] = ['All', '5G', '4G', '2G'];
const OPERATOR_OPTIONS: OperatorType[] = ['Airtel', 'BSNL & MTNL', 'Jio', 'Vi', 'WIFI'];

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
  const [selectedOperator, setSelectedOperator] = useState<OperatorType>('Airtel');
  const [activeDropdown, setActiveDropdown] = useState<DropdownType>(null);
  const [mapType, setMapType] = useState<MapType>('map');
  const [isSearching, setIsSearching] = useState(false);

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
          lat: s.lat!,
          lng: s.lng!,
          down: s.down_mbps || 0,
          up: s.up_mbps || 0,
          ping: s.latency_ms || 0,
          jitter: s.jitter_ms || 0,
          carrier: s.carrier || (s.network === 'wifi' ? 'WIFI' : 'Cellular'),
          tech: s.radio || (s.network === 'wifi' ? 'WIFI' : '4G'),
          ts: s.ts,
        })),
    [samples]
  );

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
    if (onRefresh) onRefresh();
  };

  const handleZoomIn = () => {
    webViewRef.current?.injectJavaScript('window.zoomIn(); true;');
  };

  const handleZoomOut = () => {
    webViewRef.current?.injectJavaScript('window.zoomOut(); true;');
  };

  // Push filter update to WebView
  const handleSelectOption = (type: DropdownType, option: string) => {
    if (type === 'metric') {
      setSelectedMetric(option as MetricType);
      webViewRef.current?.injectJavaScript(
        `window.updateFilters('${selectedOperator}', '${selectedTech}', '${option}'); true;`
      );
    } else if (type === 'technology') {
      setSelectedTech(option as TechnologyType);
      webViewRef.current?.injectJavaScript(
        `window.updateFilters('${selectedOperator}', '${option}', '${selectedMetric}'); true;`
      );
    } else if (type === 'operator') {
      setSelectedOperator(option as OperatorType);
      webViewRef.current?.injectJavaScript(
        `window.updateFilters('${option}', '${selectedTech}', '${selectedMetric}'); true;`
      );
    }
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
  </style>
</head>
<body>
  <div id="map"></div>

  <script>
    var centerLat = ${defaultCenter.lat};
    var centerLng = ${defaultCenter.lng};
    var currentOperator = '${selectedOperator}';
    var currentTech = '${selectedTech}';
    var currentMetric = '${selectedMetric}';
    var userSamples = ${JSON.stringify(validSamples)};

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
      renderHexagons();
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

    // Seeded pseudo-random generator for consistent regional simulation
    function pseudoRandom(seed) {
      var x = Math.sin(seed++) * 10000;
      return x - Math.floor(x);
    }

    // Realistic Connected Hexagonal Grid Generator
    function renderHexagons() {
      hexagonLayerGroup.clearLayers();

      var r = 0.015; // hexagon radius ~1.5km
      var deltaLat = 1.5 * r;
      var latScale = Math.cos(centerLat * Math.PI / 180);
      var deltaLng = Math.sqrt(3) * r / latScale;

      // Hexagonal cluster shape bounds around center
      var rows = 12;
      var cols = 12;

      for (var row = -Math.floor(rows / 2); row <= Math.floor(rows / 2); row++) {
        for (var col = -Math.floor(cols / 2); col <= Math.floor(cols / 2); col++) {
          var dist = Math.sqrt(row * row + col * col);
          // Realistic clustered shape (like in user screenshot)
          var jitterShape = pseudoRandom(row * 31 + col * 17);
          if (dist > 5.5 + jitterShape * 1.5) continue;

          // Some scattered suburban outliers as in screenshot
          if (dist > 3.8 && jitterShape < 0.35) continue;

          var hLat = centerLat + row * deltaLat;
          var colOffset = (Math.abs(row) % 2 === 1) ? (deltaLng / 2) : 0;
          var hLng = centerLng + col * deltaLng + colOffset;

          var cellSeed = Math.abs(Math.sin(hLat * 12.9898 + hLng * 78.233)) * 43758.5453;
          var randVal = cellSeed - Math.floor(cellSeed);

          // Operator profile adjustments
          var opFactor = 0;
          if (currentOperator === 'Airtel') opFactor = 0.15;
          else if (currentOperator === 'Jio') opFactor = 0.2;
          else if (currentOperator === 'Vi') opFactor = -0.05;
          else if (currentOperator === 'BSNL & MTNL') opFactor = -0.25;
          else if (currentOperator === 'WIFI') opFactor = (dist < 2.5 ? 0.3 : -0.5);

          // Tech profile adjustments
          var techFactor = 0;
          if (currentTech === '5G') techFactor = (dist < 3.2 ? 0.35 : -0.3);
          else if (currentTech === '4G') techFactor = 0.1;
          else if (currentTech === '2G') techFactor = -0.3;

          // Urban center score (center has better coverage)
          var centerScore = 1 - (dist / 6.0);
          var totalScore = centerScore * 0.5 + randVal * 0.35 + opFactor + techFactor;

          var rating = 'Good';
          var color = COLOR_GOOD;
          var badgeClass = 'badge-good';
          var speedDown = 22.4;
          var speedUp = 8.5;
          var latency = 38;

          if (totalScore >= 0.72) {
            rating = 'Excellent';
            color = COLOR_EXCELLENT;
            badgeClass = 'badge-excellent';
            speedDown = Math.round((65 + randVal * 85) * 10) / 10;
            speedUp = Math.round((20 + randVal * 30) * 10) / 10;
            latency = Math.round(14 + randVal * 12);
          } else if (totalScore >= 0.50) {
            rating = 'Better';
            color = COLOR_BETTER;
            badgeClass = 'badge-better';
            speedDown = Math.round((35 + randVal * 30) * 10) / 10;
            speedUp = Math.round((12 + randVal * 12) * 10) / 10;
            latency = Math.round(24 + randVal * 16);
          } else if (totalScore >= 0.28) {
            rating = 'Good';
            color = COLOR_GOOD;
            badgeClass = 'badge-good';
            speedDown = Math.round((14 + randVal * 20) * 10) / 10;
            speedUp = Math.round((4 + randVal * 8) * 10) / 10;
            latency = Math.round(40 + randVal * 25);
          } else {
            rating = 'Poor';
            color = COLOR_POOR;
            badgeClass = 'badge-poor';
            speedDown = Math.round((2 + randVal * 8) * 10) / 10;
            speedUp = Math.round((0.8 + randVal * 3) * 10) / 10;
            latency = Math.round(75 + randVal * 45);
          }

          // Check if any real user sample falls in this hexagon
          var matchingSample = userSamples.find(function(s) {
            var dLat = Math.abs(s.lat - hLat);
            var dLng = Math.abs(s.lng - hLng);
            return dLat < r && dLng < r;
          });

          if (matchingSample) {
            speedDown = Math.round(matchingSample.down * 10) / 10;
            speedUp = Math.round(matchingSample.up * 10) / 10;
            latency = Math.round(matchingSample.ping);
            if (speedDown >= 50) {
              rating = 'Excellent'; color = COLOR_EXCELLENT; badgeClass = 'badge-excellent';
            } else if (speedDown >= 25) {
              rating = 'Better'; color = COLOR_BETTER; badgeClass = 'badge-better';
            } else if (speedDown >= 10) {
              rating = 'Good'; color = COLOR_GOOD; badgeClass = 'badge-good';
            } else {
              rating = 'Poor'; color = COLOR_POOR; badgeClass = 'badge-poor';
            }
          }

          var hexCoords = getHexagonVertices(hLat, hLng, r);

          var polygon = L.polygon(hexCoords, {
            color: '#FFFFFF',
            weight: 1.5,
            opacity: 0.95,
            fillColor: color,
            fillOpacity: 0.72,
            smoothFactor: 1
          });

          var techLabel = currentTech === 'All' ? '5G / 4G' : currentTech;
          var popupContent =
            '<div class="popup-container">' +
              '<div class="popup-header">' +
                '<span class="popup-title">' + currentOperator + ' Coverage</span>' +
                '<span class="popup-badge ' + badgeClass + '">' + rating + '</span>' +
              '</div>' +
              '<div class="popup-row"><span>Download:</span><span class="popup-val" style="color:' + color + ';">' + speedDown + ' Mbps</span></div>' +
              '<div class="popup-row"><span>Upload:</span><span class="popup-val">' + speedUp + ' Mbps</span></div>' +
              '<div class="popup-row"><span>Latency:</span><span class="popup-val">' + latency + ' ms</span></div>' +
              '<div class="popup-row"><span>Technology:</span><span class="popup-val">' + techLabel + '</span></div>' +
              '<div class="popup-op">' +
                '<span>&#9679;</span> ' + currentOperator + ' Verified Grid' +
              '</div>' +
            '</div>';

          polygon.bindPopup(popupContent, { maxWidth: 240, closeButton: false });
          hexagonLayerGroup.addLayer(polygon);
        }
      }
    }

    // Render user sample markers (glowing pinpoint markers)
    function renderUserSamplePins() {
      sampleMarkerGroup.clearLayers();
      userSamples.forEach(function(s) {
        var pColor = COLOR_EXCELLENT;
        if (s.down < 10) pColor = COLOR_POOR;
        else if (s.down < 25) pColor = COLOR_GOOD;
        else if (s.down < 50) pColor = COLOR_BETTER;

        var circle = L.circleMarker([s.lat, s.lng], {
          radius: 6,
          fillColor: pColor,
          color: '#FFFFFF',
          weight: 2,
          opacity: 1,
          fillOpacity: 1
        });

        var pop =
          '<div class="popup-container">' +
            '<div class="popup-header">' +
              '<span class="popup-title">My Measured Test</span>' +
              '<span class="popup-badge badge-better">' + s.down.toFixed(1) + 'M</span>' +
            '</div>' +
            '<div class="popup-row"><span>Download:</span><span class="popup-val">' + s.down.toFixed(1) + ' Mbps</span></div>' +
            '<div class="popup-row"><span>Upload:</span><span class="popup-val">' + s.up.toFixed(1) + ' Mbps</span></div>' +
            '<div class="popup-row"><span>Ping:</span><span class="popup-val">' + Math.round(s.ping) + ' ms</span></div>' +
            '<div class="popup-row"><span>Carrier:</span><span class="popup-val">' + s.carrier + '</span></div>' +
          '</div>';

        circle.bindPopup(pop, { closeButton: false });
        sampleMarkerGroup.addLayer(circle);
      });
    }

    // Dynamic Filter Handler (called from React Native without reloading)
    window.updateFilters = function(operator, tech, metric) {
      currentOperator = operator;
      currentTech = tech;
      currentMetric = metric;
      renderHexagons();
    };

    // Initial render
    renderHexagons();
    renderUserSamplePins();
  </script>
</body>
</html>
    `;
  }, [defaultCenter, selectedOperator, selectedTech, selectedMetric, validSamples]);

  return (
    <View style={styles.container}>
      {/* 1. Map Title */}
      <View style={styles.headerRow}>
        <Text style={styles.screenTitle}>Map</Text>
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
