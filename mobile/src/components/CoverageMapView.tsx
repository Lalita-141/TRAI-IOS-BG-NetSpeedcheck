import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { Sample } from '../types';
import {
  DownloadIcon,
  UploadIcon,
  ClockIcon,
  WaveformIcon,
  TargetLocateIcon,
} from './Icons';

interface CoverageMapViewProps {
  samples: Sample[];
  currentLocation?: { lat: number | null; lng: number | null } | null;
  onRefresh?: () => void;
  onNavigateHistory?: () => void;
}

export const CoverageMapView: React.FC<CoverageMapViewProps> = ({
  samples,
  currentLocation,
  onRefresh,
  onNavigateHistory,
}) => {
  // Filter samples that have valid coordinates
  const validSamples = useMemo(
    () => samples.filter(s => s.lat != null && s.lng != null),
    [samples]
  );

  const latestSample = samples.length > 0 ? samples[0] : null;

  // Compute map center
  const centerLat = currentLocation?.lat || (validSamples.length > 0 ? validSamples[0].lat : 18.5501);
  const centerLng = currentLocation?.lng || (validSamples.length > 0 ? validSamples[0].lng : 73.9410);

  // Compute summary stats
  const stats = useMemo(() => {
    if (validSamples.length === 0) return { total: 0, avgDown: 0, maxDown: 0 };
    let totalDown = 0;
    let maxDown = 0;
    validSamples.forEach(s => {
      const down = s.down_mbps || 0;
      totalDown += down;
      if (down > maxDown) maxDown = down;
    });
    return {
      total: validSamples.length,
      avgDown: parseFloat((totalDown / validSamples.length).toFixed(1)),
      maxDown: parseFloat(maxDown.toFixed(1)),
    };
  }, [validSamples]);

  // Generate HTML for Leaflet Map
  const mapHtml = useMemo(() => {
    const markersData = validSamples.map(s => {
      const speed = s.down_mbps || 0;
      let color = '#00A389'; // Teal / Green
      if (speed < 10) color = '#EF4444'; // Red
      else if (speed < 25) color = '#F59E0B'; // Amber

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
    body { margin: 0; padding: 0; background: #F8FAFC; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    #map { width: 100vw; height: 100vh; background: #F1F5F9; }
    .custom-popup .leaflet-popup-content-wrapper {
      background: #FFFFFF;
      color: #0F172A;
      border: 1px solid #E2E8F0;
      border-radius: 12px;
      padding: 4px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.12);
    }
    .custom-popup .leaflet-popup-tip { background: #FFFFFF; }
    .popup-title { font-weight: 800; font-size: 13px; color: #00A389; margin-bottom: 4px; }
    .popup-row { font-size: 11px; color: #64748B; margin: 2px 0; display: flex; justify-content: space-between; }
    .popup-val { font-weight: 700; color: #0F172A; }
    .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; background: #CCFBF1; color: #0F766E; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', { zoomControl: false, attributionControl: false }).setView([${centerLat}, ${centerLng}], 14);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap'
    }).addTo(map);

    var markers = ${JSON.stringify(markersData)};
    var bounds = [];

    markers.forEach(function(m) {
      bounds.push([m.lat, m.lng]);
      var marker = L.circleMarker([m.lat, m.lng], {
        radius: 8,
        fillColor: m.color,
        color: '#FFFFFF',
        weight: 2.5,
        opacity: 1,
        fillOpacity: 0.9
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
      map.fitBounds(bounds, { padding: [30, 30] });
    }
  </script>
</body>
</html>
    `;
  }, [validSamples, centerLat, centerLng]);

  const latestTimeStr = latestSample
    ? new Date(latestSample.ts * 1000).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      })
    : '';

  const latestCarrier =
    latestSample?.carrier && latestSample.carrier !== '--' && latestSample.carrier !== 'wifi'
      ? latestSample.carrier
      : latestSample?.network === 'wifi'
      ? 'Wi-Fi'
      : latestSample?.radio || 'Cellular';

  return (
    <View style={styles.container}>
      {/* Top 4-Metrics Quick Header Strip (Option B Style) */}
      <View style={styles.topStatsCard}>
        <View style={styles.topStatCol}>
          <DownloadIcon size={16} color="#0284C7" />
          <Text style={styles.topStatVal}>
            {latestSample?.down_mbps != null ? latestSample.down_mbps.toFixed(1) : '--'}
          </Text>
          <Text style={styles.topStatUnit}>Mbps</Text>
          <Text style={styles.topStatLabel}>Download</Text>
        </View>

        <View style={styles.topStatCol}>
          <UploadIcon size={16} color="#7C3AED" />
          <Text style={styles.topStatVal}>
            {latestSample?.up_mbps != null ? latestSample.up_mbps.toFixed(1) : '--'}
          </Text>
          <Text style={styles.topStatUnit}>Mbps</Text>
          <Text style={styles.topStatLabel}>Upload</Text>
        </View>

        <View style={styles.topStatCol}>
          <ClockIcon size={16} color="#D97706" />
          <Text style={styles.topStatVal}>
            {latestSample?.latency_ms != null ? Math.round(latestSample.latency_ms) : '--'}
          </Text>
          <Text style={styles.topStatUnit}>ms</Text>
          <Text style={styles.topStatLabel}>Ping</Text>
        </View>

        <View style={styles.topStatCol}>
          <WaveformIcon size={16} color="#DB2777" />
          <Text style={styles.topStatVal}>
            {latestSample?.jitter_ms != null ? latestSample.jitter_ms.toFixed(1) : '--'}
          </Text>
          <Text style={styles.topStatUnit}>ms</Text>
          <Text style={styles.topStatLabel}>Jitter</Text>
        </View>
      </View>

      {/* Map Card Container (Option B Theme) */}
      <View style={styles.mapCard}>
        {/* Card Header Strip: Airtel • Wi-Fi • Outdoor, Timestamp */}
        <View style={styles.mapCardHeader}>
          <View style={styles.headerPillRow}>
            <View style={styles.carrierPill}>
              <Text style={styles.carrierPillText}>
                {latestCarrier} • {latestSample?.network === 'wifi' ? 'Wi-Fi' : latestSample?.radio || 'Cell'} •{' '}
                {latestSample?.location_type || 'Outdoor'}
              </Text>
            </View>

            {latestTimeStr ? (
              <View style={styles.datePill}>
                <Text style={styles.datePillText}>{latestTimeStr}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Map View */}
        <View style={styles.mapViewport}>
          <WebView
            originWhitelist={['*']}
            source={{ html: mapHtml }}
            style={styles.webview}
            startInLoadingState
            renderLoading={() => (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#00A389" />
                <Text style={styles.loadingText}>Loading Map...</Text>
              </View>
            )}
          />

          {/* Floating Bubble over Map (Option B Callout) */}
          {latestSample && (
            <View style={styles.floatingCallout}>
              <View style={styles.calloutRow}>
                <Text style={styles.calloutSpeed}>
                  {latestSample.down_mbps != null ? `${latestSample.down_mbps.toFixed(1)} Mbps` : '--'}
                  <Text style={{ color: '#0284C7' }}> ↓</Text>
                </Text>
                <Text style={styles.calloutSpeed}>
                  {latestSample.up_mbps != null ? `${latestSample.up_mbps.toFixed(1)} Mbps` : '--'}
                  <Text style={{ color: '#7C3AED' }}> ↑</Text>
                </Text>
              </View>
              <View style={styles.calloutSubRow}>
                <Text style={styles.calloutSubText}>
                  Ping {latestSample.latency_ms != null ? `${Math.round(latestSample.latency_ms)} ms` : '--'}
                </Text>
                <Text style={styles.calloutSubText}>
                  Jitter {latestSample.jitter_ms != null ? `${latestSample.jitter_ms.toFixed(1)} ms` : '--'}
                </Text>
              </View>
            </View>
          )}

          {/* Floating Locate Button in bottom right */}
          <TouchableOpacity style={styles.locateBtn} onPress={onRefresh} activeOpacity={0.8}>
            <TargetLocateIcon size={18} color="#0F172A" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Legend & Stats Footer Strip */}
      <View style={styles.footerStrip}>
        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#00A389' }]} />
            <Text style={styles.legendText}>&gt;25M (Good)</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#F59E0B' }]} />
            <Text style={styles.legendText}>10-25M (Fair)</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#EF4444' }]} />
            <Text style={styles.legendText}>&lt;10M (Weak)</Text>
          </View>
        </View>

        <View style={styles.pinsSummaryRow}>
          <Text style={styles.pinsSummaryText}>
            Coverage: <Text style={styles.pinsSummaryBold}>{stats.total} Pins</Text> • Peak:{' '}
            <Text style={styles.pinsSummaryBold}>{stats.maxDown} Mbps</Text>
          </Text>

          {onNavigateHistory && (
            <TouchableOpacity onPress={onNavigateHistory}>
              <Text style={styles.viewAllLink}>View All &gt;</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F6FA',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  topStatsCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 6,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E8EDF2',
    justifyContent: 'space-around',
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  topStatCol: {
    alignItems: 'center',
    flex: 1,
  },
  topStatVal: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 3,
    fontVariant: ['tabular-nums'],
  },
  topStatUnit: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
  },
  topStatLabel: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 2,
    fontWeight: '500',
  },
  mapCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E8EDF2',
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  mapCardHeader: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerPillRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  carrierPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  carrierPillText: {
    color: '#334155',
    fontSize: 11,
    fontWeight: '700',
  },
  datePill: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  datePillText: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '600',
  },
  mapViewport: {
    flex: 1,
    position: 'relative',
  },
  webview: {
    flex: 1,
    backgroundColor: '#F1F5F9',
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
    marginTop: 8,
  },
  floatingCallout: {
    position: 'absolute',
    top: 14,
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  calloutRow: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
  },
  calloutSpeed: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  calloutSubRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    marginTop: 3,
  },
  calloutSubText: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
  },
  locateBtn: {
    position: 'absolute',
    bottom: 14,
    right: 14,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    elevation: 3,
  },
  footerStrip: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E8EDF2',
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 6,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  legendText: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
  },
  pinsSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 6,
  },
  pinsSummaryText: {
    fontSize: 11,
    color: '#64748B',
  },
  pinsSummaryBold: {
    color: '#00A389',
    fontWeight: '700',
  },
  viewAllLink: {
    fontSize: 11,
    color: '#00A389',
    fontWeight: '700',
  },
});
