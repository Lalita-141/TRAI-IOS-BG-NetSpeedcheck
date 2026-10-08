import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { Sample } from '../types';

interface CoverageMapViewProps {
  samples: Sample[];
  currentLocation?: { lat: number | null; lng: number | null } | null;
  onRefresh?: () => void;
}

export const CoverageMapView: React.FC<CoverageMapViewProps> = ({
  samples,
  currentLocation,
  onRefresh,
}) => {
  // Filter samples that have valid coordinates
  const validSamples = useMemo(
    () => samples.filter(s => s.lat != null && s.lng != null),
    [samples]
  );

  // Compute map center
  const centerLat = currentLocation?.lat || (validSamples.length > 0 ? validSamples[0].lat : 18.5501);
  const centerLng = currentLocation?.lng || (validSamples.length > 0 ? validSamples[0].lng : 73.9410);

  // Compute summary stats
  const stats = useMemo(() => {
    if (validSamples.length === 0) return { total: 0, avgDown: 0, maxDown: 0, operators: 0 };
    let totalDown = 0;
    let maxDown = 0;
    const ops = new Set<string>();
    validSamples.forEach(s => {
      const down = s.down_mbps || 0;
      totalDown += down;
      if (down > maxDown) maxDown = down;
      if (s.carrier) ops.add(s.carrier);
    });
    return {
      total: validSamples.length,
      avgDown: parseFloat((totalDown / validSamples.length).toFixed(1)),
      maxDown: parseFloat(maxDown.toFixed(1)),
      operators: ops.size || 1,
    };
  }, [validSamples]);

  // Generate HTML for Leaflet Map
  const mapHtml = useMemo(() => {
    const markersData = validSamples.map(s => {
      const speed = s.down_mbps || 0;
      let color = '#10B981'; // Green
      if (speed < 10) color = '#EF4444'; // Red
      else if (speed < 25) color = '#F59E0B'; // Yellow

      const dateStr = new Date(s.ts * 1000).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      const carrier = s.carrier || (s.network === 'wifi' ? 'Wi-Fi' : 'Cellular');
      const radio = s.radio || '';

      return {
        lat: s.lat,
        lng: s.lng,
        color,
        speed,
        carrier,
        radio,
        up: s.up_mbps || 0,
        ping: s.latency_ms || 0,
        jitter: s.jitter_ms || 0,
        date: dateStr,
      };
    });

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    body { margin: 0; padding: 0; background: #0B0F19; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    #map { width: 100vw; height: 100vh; background: #0B0F19; }
    .leaflet-container { background: #0B0F19 !important; }
    .custom-popup .leaflet-popup-content-wrapper {
      background: #131B2E;
      color: #F8FAFC;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 4px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.6);
    }
    .custom-popup .leaflet-popup-tip { background: #131B2E; }
    .popup-title { font-weight: 800; font-size: 14px; color: #06B6D4; margin-bottom: 4px; }
    .popup-row { font-size: 12px; color: #94A3B8; margin: 2px 0; display: flex; justify-content: space-between; }
    .popup-val { font-weight: 700; color: #F8FAFC; }
    .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 800; background: rgba(6,182,212,0.2); color: #38BDF8; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', { zoomControl: true, attributionControl: false }).setView([${centerLat}, ${centerLng}], 14);

    // OpenStreetMap free tile server (No API key needed)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    var markers = ${JSON.stringify(markersData)};
    var bounds = [];

    markers.forEach(function(m) {
      bounds.push([m.lat, m.lng]);
      var marker = L.circleMarker([m.lat, m.lng], {
        radius: 9,
        fillColor: m.color,
        color: '#FFFFFF',
        weight: 2,
        opacity: 0.9,
        fillOpacity: 0.85
      }).addTo(map);

      var popupHtml = '<div style="min-width: 140px;">' +
        '<div class="popup-title">' + m.carrier + ' ' + (m.radio ? '<span class="badge">' + m.radio + '</span>' : '') + '</div>' +
        '<div class="popup-row"><span>Download:</span><span class="popup-val" style="color:' + m.color + ';">' + m.speed.toFixed(1) + ' Mbps</span></div>' +
        '<div class="popup-row"><span>Upload:</span><span class="popup-val">' + m.up.toFixed(1) + ' Mbps</span></div>' +
        '<div class="popup-row"><span>Latency:</span><span class="popup-val">' + Math.round(m.ping) + ' ms</span></div>' +
        '<div class="popup-row"><span>Time:</span><span class="popup-val">' + m.date + '</span></div>' +
        '</div>';

      marker.bindPopup(popupHtml, { className: 'custom-popup' });
    });

    if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  </script>
</body>
</html>
    `;
  }, [validSamples, centerLat, centerLng]);

  return (
    <View style={styles.container}>
      {/* Top Coverage Stats Strip (TRAI Style) */}
      <View style={styles.statsStrip}>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>TEST PINS</Text>
          <Text style={styles.statValue}>{stats.total}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>AVG DOWNLOAD</Text>
          <Text style={[styles.statValue, { color: '#06B6D4' }]}>
            {stats.avgDown > 0 ? `${stats.avgDown}M` : '--'}
          </Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>PEAK SPEED</Text>
          <Text style={[styles.statValue, { color: '#10B981' }]}>
            {stats.maxDown > 0 ? `${stats.maxDown}M` : '--'}
          </Text>
        </View>
      </View>

      {/* Map Legend */}
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#10B981' }]} />
          <Text style={styles.legendText}>&gt;25 Mbps (Good)</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#F59E0B' }]} />
          <Text style={styles.legendText}>10-25 Mbps (Fair)</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#EF4444' }]} />
          <Text style={styles.legendText}>&lt;10 Mbps (Weak)</Text>
        </View>
      </View>

      {/* Interactive Map WebView */}
      <View style={styles.mapWrapper}>
        <WebView
          originWhitelist={['*']}
          source={{ html: mapHtml }}
          style={styles.webview}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#06B6D4" />
              <Text style={styles.loadingText}>Loading Coverage Map...</Text>
            </View>
          )}
        />
      </View>

      {/* Floating Refresh Control */}
      {onRefresh && (
        <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh}>
          <Text style={styles.refreshBtnText}>🔄 Refresh Map</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F19',
  },
  statsStrip: {
    flexDirection: 'row',
    backgroundColor: '#131B2E',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 8,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  statBox: {
    alignItems: 'center',
    flex: 1,
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.8,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F8FAFC',
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#1E293B',
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 5,
  },
  legendText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  mapWrapper: {
    flex: 1,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  webview: {
    flex: 1,
    backgroundColor: '#0B0F19',
  },
  loadingContainer: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#0B0F19',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 10,
    fontWeight: '600',
  },
  refreshBtn: {
    position: 'absolute',
    bottom: 26,
    right: 26,
    backgroundColor: '#1E293B',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#334155',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 6,
  },
  refreshBtnText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
  },
});
