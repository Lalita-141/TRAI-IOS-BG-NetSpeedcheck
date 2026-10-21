import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Search, Crosshair } from 'lucide-react';
import type { MapPoint, LocationSearchResult } from '../types';

interface CoverageMapProps {
  onPointSelect?: (point: MapPoint) => void;
}

// Clean Esri Dark Canvas (100% Free, No API Key, No Watermark, Native Dark Mode)
const DARK_MAP_TILE =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';

// Clean Esri High-Resolution World Imagery
const SATELLITE_TILE =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

export const CoverageMap: React.FC<CoverageMapProps> = ({ onPointSelect }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletInstance = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const isInitialLoad = useRef<boolean>(true);

  const [activeLayer, setActiveLayer] = useState<'map' | 'satellite'>('map');
  const [metric, setMetric] = useState<string>('Coverage');
  const [technology, setTechnology] = useState<string>('All');
  const [operator, setOperator] = useState<string>('All');

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<LocationSearchResult[]>([]);
  const [mapPoints, setMapPoints] = useState<MapPoint[]>([]);

  // Initialize Map
  useEffect(() => {
    if (!mapRef.current || leafletInstance.current) return;

    const map = L.map(mapRef.current, {
      zoomControl: false,
    }).setView([28.6139, 77.2090], 10); // Center on Delhi NCR

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Add Dark Canvas Tile
    const defaultTile = L.tileLayer(DARK_MAP_TILE, {
      attribution: '&copy; Esri, OpenStreetMap',
      maxZoom: 16,
    }).addTo(map);

    tileLayerRef.current = defaultTile;
    markersLayerRef.current = L.layerGroup().addTo(map);
    leafletInstance.current = map;

    return () => {
      map.remove();
      leafletInstance.current = null;
    };
  }, []);

  // Handle Layer Toggle (Dark Map vs Satellite)
  const toggleMapLayer = (type: 'map' | 'satellite') => {
    if (!leafletInstance.current || activeLayer === type) return;

    if (tileLayerRef.current) {
      leafletInstance.current.removeLayer(tileLayerRef.current);
    }

    const tileUrl = type === 'satellite' ? SATELLITE_TILE : DARK_MAP_TILE;

    tileLayerRef.current = L.tileLayer(tileUrl, {
      attribution: '&copy; Esri',
      maxZoom: 18,
    }).addTo(leafletInstance.current);

    setActiveLayer(type);
  };

  // Fetch Crowdsourced Telemetry Points based on selected filters
  const fetchMapPoints = async () => {
    try {
      const params = new URLSearchParams({
        metric,
        technology,
        operator,
        limit: '1000',
      });

      const res = await fetch(`/v1/crowdsource/map?${params.toString()}`);
      if (!res.ok) return;
      const data: MapPoint[] = await res.json();
      setMapPoints(data);

      if (markersLayerRef.current && leafletInstance.current) {
        markersLayerRef.current.clearLayers();
        const markerList: L.CircleMarker[] = [];

        data.forEach(p => {
          if (p.lat && p.lng) {
            const marker = L.circleMarker([p.lat, p.lng], {
              radius: 10,
              fillColor: p.color,
              color: '#FFFFFF',
              weight: 2,
              opacity: 0.95,
              fillOpacity: 0.85,
            });

            marker.bindPopup(`
              <div style="font-family: inherit; font-size: 13px; color: #F8FAFC; min-width: 170px;">
                <div style="font-weight: 800; font-size: 14px; margin-bottom: 6px; color: #60A5FA; display: flex; align-items: center; justify-content: space-between;">
                  <span>${p.carrier || 'Operator'}</span>
                  <span style="font-size: 11px; background: rgba(255,255,255,0.1); padding: 1px 6px; border-radius: 4px; color: #94A3B8;">${p.radio || 'Mobile'}</span>
                </div>
                <div style="margin-bottom: 2px;">Downlink: <b style="color: #10B981;">${p.down_mbps != null ? p.down_mbps.toFixed(1) : '--'} Mbps</b></div>
                <div style="margin-bottom: 2px;">Uplink: <b style="color: #60A5FA;">${p.up_mbps != null ? p.up_mbps.toFixed(1) : '--'} Mbps</b></div>
                <div style="margin-bottom: 2px;">Latency: <b>${p.latency_ms != null ? Math.round(p.latency_ms) : '--'} ms</b></div>
                <div style="margin-bottom: 6px;">Signal: <b>${p.signal_dbm != null ? `${p.signal_dbm} dBm` : 'N/A'}</b></div>
                <div style="padding: 3px 8px; border-radius: 6px; background: ${p.color}; color: #FFFFFF; font-weight: 700; font-size: 11px; display: inline-block;">
                  ${p.rating} Performance
                </div>
              </div>
            `);

            marker.on('click', () => onPointSelect?.(p));
            markersLayerRef.current?.addLayer(marker);
            markerList.push(marker);
          }
        });

        // Fit bounds on first load
        if (isInitialLoad.current && markerList.length > 0 && leafletInstance.current) {
          const group = L.featureGroup(markerList);
          leafletInstance.current.fitBounds(group.getBounds().pad(0.35), {
            maxZoom: 11,
          });
          isInitialLoad.current = false;
        }
      }
    } catch (err) {
      console.error('Failed to load crowdsource points:', err);
    }
  };

  useEffect(() => {
    fetchMapPoints();
  }, [metric, technology, operator]);

  // Handle Location Search
  const handleSearchLocation = async (q: string) => {
    setSearchQuery(q);
    if (q.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    try {
      const res = await fetch(`/v1/locations/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const results = await res.json();
        setSearchResults(results);
      }
    } catch (e) {
      setSearchResults([]);
    }
  };

  const selectLocation = (loc: LocationSearchResult) => {
    if (leafletInstance.current) {
      leafletInstance.current.flyTo([loc.lat, loc.lng], 13, { duration: 1.5 });
    }
    setSearchResults([]);
    setSearchQuery(loc.name.split(',')[0]);
  };

  // Center on User's Location
  const handleLocateMe = () => {
    if (navigator.geolocation && leafletInstance.current) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          leafletInstance.current?.flyTo([pos.coords.latitude, pos.coords.longitude], 13, {
            duration: 1.5,
          });
        },
        err => {
          console.warn('Geolocation failed:', err.message);
        }
      );
    }
  };

  return (
    <div className="map-view-wrapper">
      <div id="leaflet-map-container" ref={mapRef} />

      {/* Floating Filter Controls matching Mobile App Screenshot */}
      <div className="map-floating-controls">
        {/* Search for Location */}
        <div className="map-search-box">
          <Search className="map-search-icon" size={16} />
          <input
            type="text"
            className="map-input"
            placeholder="Search for location, city, pin..."
            value={searchQuery}
            onChange={e => handleSearchLocation(e.target.value)}
          />
          {searchResults.length > 0 && (
            <div
              style={{
                position: 'absolute',
                top: '46px',
                left: 0,
                right: 0,
                background: '#0E1628',
                border: '1px solid var(--border-card)',
                borderRadius: '12px',
                overflow: 'hidden',
                zIndex: 2000,
                boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
              }}
            >
              {searchResults.map((item, i) => (
                <div
                  key={i}
                  onClick={() => selectLocation(item)}
                  style={{
                    padding: '10px 14px',
                    fontSize: '12px',
                    color: '#F8FAFC',
                    cursor: 'pointer',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {item.name}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Metric Selector */}
        <select
          className="map-select"
          value={metric}
          onChange={e => setMetric(e.target.value)}
        >
          <option value="Coverage">Coverage (dBm)</option>
          <option value="Download">Download Speed</option>
          <option value="Upload">Upload Speed</option>
          <option value="Latency">Latency (ms)</option>
        </select>

        {/* Technology Selector */}
        <select
          className="map-select"
          value={technology}
          onChange={e => setTechnology(e.target.value)}
        >
          <option value="All">All Technologies</option>
          <option value="5G">5G</option>
          <option value="4G">4G / LTE</option>
          <option value="3G">3G</option>
          <option value="2G">2G</option>
        </select>

        {/* Operator Selector */}
        <select
          className="map-select"
          value={operator}
          onChange={e => setOperator(e.target.value)}
        >
          <option value="All">All Operators</option>
          <option value="Airtel">Bharti Airtel</option>
          <option value="Jio">Reliance Jio</option>
          <option value="Vi">Vodafone Idea (Vi)</option>
          <option value="BSNL">BSNL</option>
        </select>

        {/* Map / Satellite Toggle */}
        <div className="layer-switcher">
          <button
            className={`layer-btn ${activeLayer === 'map' ? 'active' : ''}`}
            onClick={() => toggleMapLayer('map')}
          >
            Map
          </button>
          <button
            className={`layer-btn ${activeLayer === 'satellite' ? 'active' : ''}`}
            onClick={() => toggleMapLayer('satellite')}
          >
            Satellite
          </button>
        </div>

        {/* Locate Me */}
        <button
          className="map-select"
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          onClick={handleLocateMe}
          title="Center on my location"
        >
          <Crosshair size={14} /> GPS
        </button>
      </div>

      {/* Floating Bottom Legend Matching Mobile App Screenshot */}
      <div className="map-floating-legend">
        <div className="legend-item" style={{ color: '#10B981' }}>
          <div className="legend-dot" style={{ background: '#10B981' }} />
          Excellent
        </div>
        <div className="legend-item" style={{ color: '#06B6D4' }}>
          <div className="legend-dot" style={{ background: '#06B6D4' }} />
          Better
        </div>
        <div className="legend-item" style={{ color: '#F59E0B' }}>
          <div className="legend-dot" style={{ background: '#F59E0B' }} />
          Good
        </div>
        <div className="legend-item" style={{ color: '#EF4444' }}>
          <div className="legend-dot" style={{ background: '#EF4444' }} />
          Poor
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', borderLeft: '1px solid rgba(255,255,255,0.15)', paddingLeft: '12px' }}>
          <b>{mapPoints.length}</b> Live Points
        </div>
      </div>
    </div>
  );
};
