import React from 'react';
import { Activity, Zap } from 'lucide-react';
import type { OperatorAnalytics } from '../types';

interface OperatorBenchmarksProps {
  analytics: OperatorAnalytics[];
}

export const OperatorBenchmarks: React.FC<OperatorBenchmarksProps> = ({ analytics }) => {
  const maxDown = Math.max(...analytics.map(a => a.avg_down || 0), 100);

  const getCarrierColor = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes('jio')) return '#0A84FF';
    if (lower.includes('airtel')) return '#FF3B30';
    if (lower.includes('vi') || lower.includes('vodafone')) return '#FF9500';
    return '#30D158'; // BSNL
  };

  if (!analytics || analytics.length === 0) {
    return (
      <div className="dashboard-card">
        <div className="card-title-row">
          <div className="card-title-text">
            <Activity size={18} color="#00A389" /> Operator Benchmark QoS
          </div>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No operator telemetry ingested yet.</p>
      </div>
    );
  }

  return (
    <div className="dashboard-card">
      <div className="card-title-row">
        <div className="card-title-text">
          <Zap size={20} color="#00A389" /> Telecom Operator Benchmarks
        </div>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
          Ranked by Downlink Throughput
        </span>
      </div>

      <div className="benchmark-grid">
        {analytics.map((op, i) => {
          const color = getCarrierColor(op.carrier);
          const pct = Math.min(Math.round(((op.avg_down || 0) / maxDown) * 100), 100);

          return (
            <div key={i} className="carrier-stat-card">
              <div className="carrier-stat-header">
                <div>
                  <span className="carrier-name" style={{ color }}>
                    {op.carrier}
                  </span>{' '}
                  <span className="pill-badge pill-5g" style={{ marginLeft: 6, fontSize: '10px' }}>
                    {op.radio || 'Mobile'}
                  </span>
                </div>
                <div className="carrier-metric-val" style={{ color: '#F8FAFC' }}>
                  {(op.avg_down || 0).toFixed(1)} <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Mbps</span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{ width: `${pct}%`, background: color }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
                <span>Uplink: <b>{(op.avg_up || 0).toFixed(1)} Mbps</b></span>
                <span>Latency: <b>{Math.round(op.avg_latency || 0)} ms</b></span>
                <span><b>{op.test_count}</b> tests</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
