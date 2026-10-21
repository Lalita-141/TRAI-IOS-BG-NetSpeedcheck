import React, { useState } from 'react';
import { Smartphone, Search, ArrowRight } from 'lucide-react';
import type { DeviceSummary } from '../types';

interface DevicesDirectoryProps {
  devices: DeviceSummary[];
  onSelectDevice: (deviceId: string) => void;
}

export const DevicesDirectory: React.FC<DevicesDirectoryProps> = ({
  devices,
  onSelectDevice,
}) => {
  const [search, setSearch] = useState('');

  const filtered = devices.filter(d =>
    d.device_id.toLowerCase().includes(search.toLowerCase()) ||
    (d.carrier && d.carrier.toLowerCase().includes(search.toLowerCase())) ||
    (d.device_model && d.device_model.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="dashboard-card">
      <div className="card-title-row">
        <div className="card-title-text">
          <Smartphone size={18} color="#00A389" /> Active Users & Devices Directory
        </div>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          <b>{filtered.length}</b> unique devices detected
        </span>
      </div>

      <div style={{ marginBottom: '16px', position: 'relative', maxWidth: '360px' }}>
        <Search size={14} style={{ position: 'absolute', left: 12, top: 11, color: 'var(--text-muted)' }} />
        <input
          type="text"
          className="map-input"
          style={{ paddingLeft: '34px' }}
          placeholder="Search by Device UUID, model, operator..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="table-responsive">
        <table className="custom-table">
          <thead>
            <tr>
              <th>Device UUID</th>
              <th>Hardware Model</th>
              <th>OS / Platform</th>
              <th>Primary Operator</th>
              <th>Total Tests Run</th>
              <th>Average Downlink</th>
              <th>Average Latency</th>
              <th>Last Active (IST)</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>
                  No devices found.
                </td>
              </tr>
            ) : (
              filtered.map((d, i) => {
                const dateStr = new Date(d.last_active * 1000).toLocaleString('en-IN', {
                  timeZone: 'Asia/Kolkata',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <tr key={d.device_id || i}>
                    <td style={{ fontFamily: 'monospace', color: '#60A5FA', fontWeight: 600 }}>
                      {d.device_id}
                    </td>
                    <td>{d.device_model || 'Apple iPhone'}</td>
                    <td>{d.os_platform || 'iOS 18'}</td>
                    <td>
                      <b>{d.carrier || '--'}</b>
                    </td>
                    <td>
                      <span className="pill-badge pill-5g">{d.total_tests} tests</span>
                    </td>
                    <td style={{ fontWeight: 700, color: '#10B981' }}>
                      {d.avg_down != null ? `${d.avg_down.toFixed(1)} Mbps` : '--'}
                    </td>
                    <td>{d.avg_latency != null ? `${Math.round(d.avg_latency)} ms` : '--'}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{dateStr}</td>
                    <td>
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '4px 10px', fontSize: '11px', borderRadius: '8px' }}
                        onClick={() => onSelectDevice(d.device_id)}
                      >
                        Inspect Tests <ArrowRight size={12} />
                      </button>
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
