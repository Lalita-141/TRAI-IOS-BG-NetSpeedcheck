import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
  Share,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Sample } from '../types';
import { reverseGeocode } from '../services/geocodeService';
import { useTranslation } from '../i18n';
import {
  BackArrowIcon,
  DownloadIcon,
  UploadIcon,
  CoverageTestIcon,
  SignalBarsIcon,
  GlobeIcon,
  CalendarIcon,
  ClockIcon,
  ServerIcon,
  PinIcon,
  ShareAppIcon,
  CrosshairIcon,
  PlusIcon,
  MinusIcon,
  MapPinIcon,
} from './Icons';

interface HistoryTestDetailViewProps {
  sample: Sample;
  onBack: () => void;
  onNavigateTab?: (tab: 'SPEED' | 'MAP' | 'HISTORY' | 'SETTINGS') => void;
}

export const HistoryTestDetailView: React.FC<HistoryTestDetailViewProps> = ({
  sample,
  onBack,
}) => {
  const { t } = useTranslation();
  const [locationName, setLocationName] = useState<string>('Resolving location...');
  const [mapType, setMapType] = useState<'map' | 'satellite'>('map');
  const webViewRef = useRef<any>(null);

  // Fallback to center coordinates if sample has none
  const lat = sample.lat ?? 37.7858;
  const lng = sample.lng ?? -122.4064;

  useEffect(() => {
    let isMounted = true;
    reverseGeocode(lat, lng).then(name => {
      if (isMounted) {
        setLocationName(name || 'Location Unavailable');
      }
    });
    return () => {
      isMounted = false;
    };
  }, [lat, lng]);

  const ts = sample.ts ? sample.ts * 1000 : Date.now();
  const dateObj = new Date(ts);

  const formattedDate = dateObj.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const formattedTime = dateObj.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const downSpeed =
    sample.down_mbps != null ? sample.down_mbps.toFixed(1) : '0.0';
  const upSpeed =
    sample.up_mbps != null ? sample.up_mbps.toFixed(1) : '0.0';
  const latency =
    sample.latency_ms != null ? Math.round(sample.latency_ms) : 0;
  const packetLoss =
    sample.packet_loss_pct != null ? `${sample.packet_loss_pct}%` : '0%';
  const jitter =
    sample.jitter_ms != null ? `${sample.jitter_ms.toFixed(2)} ms` : '0.00 ms';

  const carrier =
    sample.carrier && sample.carrier !== '--' && sample.carrier !== 'wifi'
      ? sample.carrier
      : 'Airtel';
  const radio = sample.network === 'wifi' ? 'Wi-Fi' : sample.radio || '4G';

  // Calculate coverage dBm
  const coverageDbm =
    sample.network === 'wifi'
      ? '-58 dBm'
      : (sample.down_mbps ?? 0) >= 50
      ? '-72 dBm'
      : (sample.down_mbps ?? 0) >= 20
      ? '-88 dBm'
      : '-101 dBm';

  const shortTestId = sample.id ? sample.id.substring(0, 6) : 'c2';
  const serverDisplay =
    sample.network === 'wifi'
      ? 'AIRTEL - Core Server'
      : `${carrier.toUpperCase()} - Core Server`;

  const handleShare = async () => {
    try {
      const msg = `NetSpeed QoS Test Result:\n• Download: ${downSpeed} Mbps\n• Upload: ${upSpeed} Mbps\n• Ping: ${latency} ms\n• Operator: ${carrier} (${radio})\n• Date: ${formattedDate} at ${formattedTime}\n• Location: ${locationName}`;
      await Share.share({
        message: msg,
        title: 'NetSpeed Test Result',
      });
    } catch {
      // ignore
    }
  };

  const handleToggleMapType = (type: 'map' | 'satellite') => {
    setMapType(type);
    webViewRef.current?.injectJavaScript(`if (window.setMapType) { window.setMapType('${type}'); } true;`);
  };

  const handleRecenter = () => {
    webViewRef.current?.injectJavaScript(`if (window.recenterMap) { window.recenterMap(); } true;`);
  };

  const handleZoomIn = () => {
    webViewRef.current?.injectJavaScript('if (window.zoomInMap) { window.zoomInMap(); } true;');
  };

  const handleZoomOut = () => {
    webViewRef.current?.injectJavaScript('if (window.zoomOutMap) { window.zoomOutMap(); } true;');
  };

  // Generate Leaflet Map HTML centered on this single test sample
  const mapHtml = useMemo(() => {
    const color = (sample.down_mbps ?? 0) >= 25 ? '#00A389' : (sample.down_mbps ?? 0) >= 10 ? '#F59E0B' : '#EF4444';
    const speedText = downSpeed;

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
      width: 36px;
      height: 42px;
      display: flex;
      flex-direction: column;
      align-items: center;
      cursor: pointer;
    }
    .speed-pin-circle {
      width: 32px;
      height: 32px;
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #FFFFFF;
      font-weight: 900;
      font-size: 11px;
      box-shadow: 0 3px 8px rgba(0,0,0,0.3);
      border: 2px solid #FFFFFF;
      letter-spacing: -0.3px;
    }
    .speed-pin-beak {
      width: 0;
      height: 0;
      border-left: 5px solid transparent;
      border-right: 5px solid transparent;
      margin-top: -1px;
    }

    /* Leaflet Popup Styling */
    .leaflet-popup-content-wrapper {
      background: #FFFFFF;
      border-radius: 14px;
      padding: 0;
      box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.25);
      border: 1px solid #E2E8F0;
    }
    .leaflet-popup-content {
      margin: 10px 14px;
      font-size: 12px;
      color: #0F172A;
      line-height: 1.4;
    }
    .leaflet-popup-tip {
      background: #FFFFFF;
    }
    .pop-title {
      font-weight: 800;
      font-size: 13px;
      color: #0F172A;
      margin-bottom: 2px;
    }
    .pop-sub {
      font-size: 11px;
      color: #64748B;
      margin-bottom: 6px;
    }
    .pop-stat-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      font-size: 11px;
      font-weight: 600;
      border-top: 1px solid #F1F5F9;
      padding-top: 4px;
      margin-top: 4px;
    }
    .pop-stat-val {
      color: #00A389;
      font-weight: 800;
    }
  </style>
</head>
<body>
  <div id="map"></div>

  <script>
    var map = L.map('map', {
      zoomControl: false,
      attributionControl: false
    }).setView([${lat}, ${lng}], 15);

    var lightLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(map);

    var satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19
    });

    var pinHtml = '<div class="speed-pin-wrap">' +
                    '<div class="speed-pin-circle" style="background-color:${color};">${speedText}</div>' +
                    '<div class="speed-pin-beak" style="border-top:6px solid ${color};"></div>' +
                  '</div>';

    var pinIcon = L.divIcon({
      className: 'custom-pin-icon',
      html: pinHtml,
      iconSize: [36, 42],
      iconAnchor: [18, 42],
      popupAnchor: [0, -40]
    });

    var popupHtml = '<div class="pop-title">${carrier} • ${radio}</div>' +
                    '<div class="pop-sub">${locationName.replace(/'/g, "\\'")}</div>' +
                    '<div class="pop-stat-row"><span>Download</span><span class="pop-stat-val">${downSpeed} Mbps</span></div>' +
                    '<div class="pop-stat-row"><span>Upload</span><span class="pop-stat-val">${upSpeed} Mbps</span></div>' +
                    '<div class="pop-stat-row"><span>Ping</span><span>${latency} ms</span></div>';

    var marker = L.marker([${lat}, ${lng}], { icon: pinIcon }).addTo(map);
    marker.bindPopup(popupHtml, { maxWidth: 220, closeButton: false }).openPopup();

    // Accuracy Circle
    L.circle([${lat}, ${lng}], {
      radius: 65,
      color: '${color}',
      fillColor: '${color}',
      fillOpacity: 0.12,
      weight: 1.5
    }).addTo(map);

    window.setMapType = function(type) {
      if (type === 'satellite') {
        map.removeLayer(lightLayer);
        satelliteLayer.addTo(map);
      } else {
        map.removeLayer(satelliteLayer);
        lightLayer.addTo(map);
      }
    };

    window.recenterMap = function() {
      map.setView([${lat}, ${lng}], 15, { animate: true });
      marker.openPopup();
    };

    window.zoomInMap = function() { map.zoomIn(); };
    window.zoomOutMap = function() { map.zoomOut(); };
  </script>
</body>
</html>
    `;
  }, [lat, lng, sample.down_mbps, downSpeed, upSpeed, latency, carrier, radio, locationName]);

  return (
    <View style={styles.container}>
      {/* Top Header Row with Back Button */}
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.75}>
          <BackArrowIcon size={20} color="#0F172A" />
          <Text style={styles.backBtnText}>{t('back_to_history', 'Back to History')}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.shareIconBtn} onPress={handleShare} activeOpacity={0.75}>
          <ShareAppIcon size={18} color="#00A389" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>

        {/* 1. TOP HERO SPEED CARD (Matching User Mockup) */}
        <View style={styles.heroCard}>
          {/* Top Row: Download & Upload side-by-side */}
          <View style={styles.heroTopRow}>
            {/* Download Column */}
            <View style={styles.heroCol}>
              <View style={styles.valueWithUnitRow}>
                <Text style={styles.heroLargeValue}>{downSpeed}</Text>
                <Text style={styles.heroUnitText}>Mbps</Text>
              </View>
              <View style={styles.heroLabelRow}>
                <Text style={styles.heroLabelText}>{t('download_speed', 'Download Speed')}</Text>
                <DownloadIcon size={14} color="#0284C7" />
              </View>
            </View>

            {/* Vertical Divider */}
            <View style={styles.heroVerticalDivider} />

            {/* Upload Column */}
            <View style={styles.heroCol}>
              <View style={styles.valueWithUnitRow}>
                <Text style={styles.heroLargeValue}>{upSpeed}</Text>
                <Text style={styles.heroUnitText}>Mbps</Text>
              </View>
              <View style={styles.heroLabelRow}>
                <Text style={styles.heroLabelText}>{t('upload_speed', 'Upload Speed')}</Text>
                <UploadIcon size={14} color="#7C3AED" />
              </View>
            </View>
          </View>

          {/* Horizontal Divider */}
          <View style={styles.heroHorizontalDivider} />

          {/* Bottom Row: 3 Metrics (Latency | Packet Loss | Jitter) */}
          <View style={styles.heroBottomRow}>
            <View style={styles.heroMetricCol}>
              <Text style={styles.metricSubLabel}>{t('ping', 'Latency')}</Text>
              <Text style={styles.metricMainValue}>{latency} ms</Text>
            </View>

            <View style={styles.heroMetricDivider} />

            <View style={styles.heroMetricCol}>
              <Text style={styles.metricSubLabel}>{t('packet_loss', 'Packet Loss')}</Text>
              <Text style={styles.metricMainValue}>{packetLoss}</Text>
            </View>

            <View style={styles.heroMetricDivider} />

            <View style={styles.heroMetricCol}>
              <Text style={styles.metricSubLabel}>{t('jitter', 'Jitter')}</Text>
              <Text style={styles.metricMainValue}>{jitter}</Text>
            </View>
          </View>
        </View>

        {/* 2. TEST DETAILS CARD (Matching User Mockup) */}
        <View style={styles.detailsCard}>
          <Text style={styles.detailsCardTitle}>{t('test_details_title', 'Test Details')}</Text>

          {/* Row 1: Coverage | Tech | Operator */}
          <View style={styles.gridThreeColRow}>
            <View style={styles.gridCol}>
              <View style={styles.fieldHeaderRow}>
                <CoverageTestIcon size={15} color="#64748B" />
                <Text style={styles.fieldHeaderLabel}>{t('filter_coverage', 'Coverage')}</Text>
              </View>
              <Text style={styles.fieldBoldValue}>{coverageDbm}</Text>
            </View>

            <View style={styles.gridCol}>
              <View style={styles.fieldHeaderRow}>
                <SignalBarsIcon size={15} color="#64748B" />
                <Text style={styles.fieldHeaderLabel}>{t('tech', 'Tech')}</Text>
              </View>
              <Text style={styles.fieldBoldValue}>{radio}</Text>
            </View>

            <View style={styles.gridCol}>
              <View style={styles.fieldHeaderRow}>
                <GlobeIcon size={15} color="#64748B" />
                <Text style={styles.fieldHeaderLabel}>{t('operator', 'Operator')}</Text>
              </View>
              <Text style={styles.fieldBoldValue}>{carrier}</Text>
            </View>
          </View>

          <View style={styles.detailsDivider} />

          {/* Row 2: Date | Time | Test ID */}
          <View style={styles.gridThreeColRow}>
            <View style={styles.gridCol}>
              <View style={styles.fieldHeaderRow}>
                <CalendarIcon size={15} color="#64748B" />
                <Text style={styles.fieldHeaderLabel}>{t('date', 'Date')}</Text>
              </View>
              <Text style={styles.fieldBoldValue}>{formattedDate}</Text>
            </View>

            <View style={styles.gridCol}>
              <View style={styles.fieldHeaderRow}>
                <ClockIcon size={15} color="#64748B" />
                <Text style={styles.fieldHeaderLabel}>{t('time', 'Time')}</Text>
              </View>
              <Text style={styles.fieldBoldValue}>{formattedTime}</Text>
            </View>

            <View style={styles.gridCol}>
              <View style={styles.fieldHeaderRow}>
                <Text style={styles.fieldDocEmoji}>📄</Text>
                <Text style={styles.fieldHeaderLabel}>{t('test_id', 'Test ID')}</Text>
              </View>
              <Text style={styles.fieldBoldValue}>{shortTestId}</Text>
            </View>
          </View>

          <View style={styles.detailsDivider} />

          {/* Row 3: Test Server */}
          <View style={styles.fieldFullBlock}>
            <View style={styles.fieldHeaderRow}>
              <ServerIcon size={15} color="#64748B" />
              <Text style={styles.fieldHeaderLabel}>{t('test_server', 'Test Server')}</Text>
            </View>
            <Text style={styles.fieldBoldValue}>{serverDisplay}</Text>
          </View>

          <View style={styles.detailsDivider} />

          {/* Row 4: Location */}
          <View style={styles.fieldFullBlock}>
            <View style={styles.fieldHeaderRow}>
              <PinIcon size={15} color="#0284C7" />
              <Text style={styles.fieldHeaderLabel}>{t('location', 'Location')}</Text>
            </View>
            <Text style={styles.locationTitleText}>{locationName}</Text>
            <Text style={styles.locationCoordinatesText}>
              Latitude: {lat.toFixed(4)}, Longitude: {lng.toFixed(4)}
            </Text>
          </View>
        </View>

        {/* 3. TEST LOCATION MAP (End of this page as explicitly requested) */}
        <View style={styles.mapCard}>
          <View style={styles.mapCardHeaderRow}>
            <View style={styles.mapTitleLeft}>
              <MapPinIcon size={16} color="#00A389" />
              <Text style={styles.mapCardTitle}>{t('test_location_map', 'Test Location Map')}</Text>
            </View>

            {/* Map / Satellite Toggle */}
            <View style={styles.mapTypeToggle}>
              <TouchableOpacity
                style={[styles.mapToggleBtn, mapType === 'map' && styles.mapToggleBtnActive]}
                onPress={() => handleToggleMapType('map')}
                activeOpacity={0.8}>
                <Text style={[styles.mapToggleText, mapType === 'map' && styles.mapToggleTextActive]}>
                  {t('tab_map', 'Map')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.mapToggleBtn, mapType === 'satellite' && styles.mapToggleBtnActive]}
                onPress={() => handleToggleMapType('satellite')}
                activeOpacity={0.8}>
                <Text style={[styles.mapToggleText, mapType === 'satellite' && styles.mapToggleTextActive]}>
                  Satellite
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Map Container with Overlay Controls */}
          <View style={styles.mapContainer}>
            <WebView
              ref={webViewRef}
              source={{ html: mapHtml }}
              style={styles.mapWebView}
              originWhitelist={['*']}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              scrollEnabled={false}
              bounces={false}
            />

            {/* Floating Action Buttons */}
            <View style={styles.mapFloatingControls}>
              <TouchableOpacity style={styles.mapControlBtn} onPress={handleRecenter} activeOpacity={0.8}>
                <CrosshairIcon size={16} color="#0F172A" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.mapControlBtn} onPress={handleZoomIn} activeOpacity={0.8}>
                <PlusIcon size={16} color="#0F172A" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.mapControlBtn} onPress={handleZoomOut} activeOpacity={0.8}>
                <MinusIcon size={16} color="#0F172A" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.mapFooterNote}>
            <Text style={styles.mapFooterNoteText}>
              📍 Coordinates: {lat.toFixed(4)}, {lng.toFixed(4)} • Pin shows {downSpeed} Mbps down
            </Text>
          </View>
        </View>

        {/* 4. BOTTOM ACTION BUTTONS */}
        <View style={styles.bottomButtonsRow}>
          <TouchableOpacity style={styles.primaryShareBtn} onPress={handleShare} activeOpacity={0.85}>
            <ShareAppIcon size={18} color="#FFFFFF" />
            <Text style={styles.primaryShareBtnText}>{t('share_result', 'Share Result')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryBackBtn} onPress={onBack} activeOpacity={0.8}>
            <Text style={styles.secondaryBackBtnText}>{t('back_to_history', 'Back to History')}</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F6FA',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E8EDF2',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
    paddingRight: 10,
  },
  backBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  shareIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E6F8F5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#B2ECE3',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
  },
  // 1. HERO SPEED CARD
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingVertical: 20,
    paddingHorizontal: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E8EDF2',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  heroCol: {
    flex: 1,
    alignItems: 'center',
  },
  valueWithUnitRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginBottom: 4,
  },
  heroLargeValue: {
    fontSize: 38,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  heroUnitText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
  },
  heroLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  heroLabelText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  heroVerticalDivider: {
    width: 1,
    height: 52,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 10,
  },
  heroHorizontalDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 18,
  },
  heroBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  heroMetricCol: {
    flex: 1,
    alignItems: 'center',
  },
  metricSubLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 4,
  },
  metricMainValue: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  heroMetricDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#E2E8F0',
  },
  // 2. TEST DETAILS CARD
  detailsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingVertical: 18,
    paddingHorizontal: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E8EDF2',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  detailsCardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 14,
  },
  detailsDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 14,
  },
  gridThreeColRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  gridCol: {
    flex: 1,
  },
  fieldHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 5,
  },
  fieldHeaderLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  fieldBoldValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  fieldDocEmoji: {
    fontSize: 13,
  },
  fieldFullBlock: {
    width: '100%',
  },
  locationTitleText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 2,
  },
  locationCoordinatesText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
  },
  // 3. TEST LOCATION MAP CARD
  mapCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E8EDF2',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  mapCardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  mapTitleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mapCardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  mapTypeToggle: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    padding: 2,
  },
  mapToggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  mapToggleBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  mapToggleText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  mapToggleTextActive: {
    color: '#0F172A',
  },
  mapContainer: {
    width: '100%',
    height: 230,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  mapWebView: {
    width: '100%',
    height: '100%',
  },
  mapFloatingControls: {
    position: 'absolute',
    right: 12,
    top: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  mapControlBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  mapFooterNote: {
    marginTop: 10,
    paddingHorizontal: 4,
  },
  mapFooterNoteText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  // 4. BOTTOM ACTION BUTTONS
  bottomButtonsRow: {
    flexDirection: 'column',
    gap: 10,
    marginTop: 4,
  },
  primaryShareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00A389',
    borderRadius: 14,
    paddingVertical: 14,
    gap: 8,
    shadowColor: '#00A389',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  primaryShareBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  secondaryBackBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  secondaryBackBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
  },
});
