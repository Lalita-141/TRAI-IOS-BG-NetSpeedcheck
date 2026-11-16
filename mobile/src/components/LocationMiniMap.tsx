import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

interface LocationMiniMapProps {
  lat: number;
  lng: number;
  accuracy?: number | null; // metres; drawn as a circle when known
  color?: string;
  height?: number;
}

/** Small map with a pin at one test location (same Leaflet + OpenStreetMap set-up as the History detail map). */
export const LocationMiniMap: React.FC<LocationMiniMapProps> = ({
  lat,
  lng,
  accuracy,
  color = '#00A389',
  height = 200,
}) => {
  const html = useMemo(
    () => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: #F8FAFC; }
    .pin { width: 18px; height: 18px; border-radius: 9px; background: ${color};
           border: 3px solid #FFFFFF; box-shadow: 0 2px 6px rgba(0,0,0,0.35); }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', { zoomControl: false, attributionControl: false, dragging: false,
      scrollWheelZoom: false, doubleClickZoom: false, touchZoom: false, boxZoom: false, keyboard: false
    }).setView([${lat}, ${lng}], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    ${accuracy ? `L.circle([${lat}, ${lng}], { radius: ${accuracy}, color: '${color}', fillColor: '${color}', fillOpacity: 0.12, weight: 1.5 }).addTo(map);` : ''}
    L.marker([${lat}, ${lng}], { icon: L.divIcon({ className: '', html: '<div class="pin"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }) }).addTo(map);
  </script>
</body>
</html>`,
    [lat, lng, accuracy, color]
  );

  return (
    <View style={[styles.container, { height }]} pointerEvents="none">
      <WebView
        source={{ html }}
        style={styles.webView}
        originWhitelist={['*']}
        javaScriptEnabled={true}
        scrollEnabled={false}
        bounces={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  webView: {
    width: '100%',
    height: '100%',
  },
});
