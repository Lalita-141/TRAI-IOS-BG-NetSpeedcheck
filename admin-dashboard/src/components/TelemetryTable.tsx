import React from 'react';
import { Search, Filter, MapPin } from 'lucide-react';
import type { TelemetrySample } from '../types';

interface TelemetryTableProps {
  samples: TelemetrySample[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  carrierFilter: string;
  onCarrierChange: (c: string) => void;
  radioFilter: string;
  onRadioChange: (r: string) => void;
  testTypeFilter: string;
  onTestTypeChange: (t: string) => void;
  onSelectSample?: (s: TelemetrySample) => void;
}

export const TelemetryTable: React.FC<TelemetryTableProps> = ({
  samples,
  searchQuery,
  onSearchChange,
  carrierFilter,
  onCarrierChange,
  radioFilter,
  onRadioChange,
  testTypeFilter,
  onTestTypeChange,
  onSelectSample,
}) => {
  return (
    <div className="dashboard-card">
      <div className="card-title-row">
        <div className="card-title-text">
          <Filter size={18} color="#00A389" /> Live Telemetry Feed
        </div>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          Showing <b>{samples.length}</b> records
        </span>
      </div>

      {/* Filter Bar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
        <div style={{ position: 'relative', flex: '1', minWidth: '220px' }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: 11, color: 'var(--text-muted)' }} />
          <input
            type="text"
            className="map-input"
            style={{ paddingLeft: '34px' }}
            placeholder="Search by Device ID or Sample ID..."
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
          />
        </div>

        <select
          className="map-select"
          value={carrierFilter}
          onChange={e => onCarrierChange(e.target.value)}
        >
          <option value="">All Operators</option>
          <option value="Jio">Reliance Jio</option>
          <option value="Airtel">Bharti Airtel</option>
          <option value="Vi">Vodafone Idea (Vi)</option>
          <option value="BSNL">BSNL</option>
        </select>

        <select
          className="map-select"
          value={radioFilter}
          onChange={e => onRadioChange(e.target.value)}
        >
          <option value="">All Radios</option>
          <option value="5G">5G</option>
          <option value="4G">4G / LTE</option>
          <option value="3G">3G</option>
          <option value="Wi-Fi">Wi-Fi</option>
        </select>

        <select
          className="map-select"
          value={testTypeFilter}
          onChange={e => onTestTypeChange(e.target.value)}
        >
          <option value="">All Test Types</option>
          <option value="speed">Speed Test</option>
          <option value="video_browser">Video & Browser</option>
          <option value="coverage">Coverage Test</option>
          <option value="continuous">Continuous Test</option>
          <option value="scheduled">Scheduled Test</option>
        </select>
      </div>

      {/* Table */}
      <div className="table-responsive">
        <table className="custom-table">
          <thead>
            <tr>
              <th>Timestamp (IST)</th>
              <th>Device UUID</th>
              <th>Operator</th>
              <th>Radio</th>
              <th>Downlink</th>
              <th>Uplink</th>
              <th>Latency</th>
              <th>Signal</th>
              <th>Test Type</th>
              <th>Location</th>
            </tr>
          </thead>
          <tbody>
            {samples.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>
                  No telemetry records found matching your filters.
                </td>
              </tr>
            ) : (
              samples.map((s, idx) => {
                const dateStr = new Date(s.ts * 1000).toLocaleString('en-IN', {
                  timeZone: 'Asia/Kolkata',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });

                const pillClass =
                  s.radio === '5G'
                    ? 'pill-5g'
                    : s.network === 'wifi'
                    ? 'pill-wifi'
                    : s.radio?.includes('4G') || s.radio?.includes('LTE')
                    ? 'pill-4g'
                    : 'pill-other';

                return (
                  <tr
                    key={s.id || idx}
                    onClick={() => onSelectSample?.(s)}
                    style={{ cursor: onSelectSample ? 'pointer' : 'default' }}
                  >
                    <td>{dateStr}</td>
                    <td style={{ fontFamily: 'monospace', color: '#60A5FA' }}>
                      {s.device_id.substring(0, 10)}...
                    </td>
                    <td>
                      <b>{s.carrier || '--'}</b>
                    </td>
                    <td>
                      <span className={`pill-badge ${pillClass}`}>{s.radio || s.network || '--'}</span>
                    </td>
                    <td style={{ fontWeight: 700, color: '#10B981' }}>
                      {s.down_mbps != null ? `${s.down_mbps.toFixed(1)} Mbps` : '--'}
                    </td>
                    <td style={{ color: '#60A5FA' }}>
                      {s.up_mbps != null ? `${s.up_mbps.toFixed(1)} Mbps` : '--'}
                    </td>
                    <td>{s.latency_ms != null ? `${Math.round(s.latency_ms)} ms` : '--'}</td>
                    <td>
                      {s.signal_dbm != null ? (
                        <span style={{ color: s.signal_dbm >= -85 ? '#10B981' : '#F59E0B' }}>
                          {s.signal_dbm} dBm
                        </span>
                      ) : (
                        '--'
                      )}
                    </td>
                    <td>
                      <span style={{ textTransform: 'capitalize', color: 'var(--text-muted)', fontSize: '11px' }}>
                        {s.test_type || 'speed'}
                      </span>
                    </td>
                    <td>
                      {s.lat && s.lng ? (
                        <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <MapPin size={12} color="#00A389" /> {s.lat.toFixed(3)}, {s.lng.toFixed(3)}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>No GPS</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
