import React from 'react';
import { Gauge, Users, ArrowDown, Award } from 'lucide-react';
import type { AdminStats } from '../types';

interface KPICardsProps {
  stats: AdminStats | null;
}

export const KPICards: React.FC<KPICardsProps> = ({ stats }) => {
  return (
    <div className="kpi-row">
      {/* 1. Total Tests */}
      <div className="kpi-card">
        <div className="kpi-top">
          <span className="kpi-label">Total Tests Ingested</span>
          <div className="kpi-icon-box">
            <Gauge size={18} />
          </div>
        </div>
        <div className="kpi-number">{(stats?.total_tests || 0).toLocaleString()}</div>
        <div className="kpi-subtext">
          <span style={{ color: '#10B981', fontWeight: 600 }}>
            +{stats?.tests_today || 0}
          </span>{' '}
          recorded today
        </div>
      </div>

      {/* 2. Active Devices */}
      <div className="kpi-card">
        <div className="kpi-top">
          <span className="kpi-label">Active iOS Devices</span>
          <div className="kpi-icon-box">
            <Users size={18} />
          </div>
        </div>
        <div className="kpi-number">{(stats?.total_devices || 0).toLocaleString()}</div>
        <div className="kpi-subtext">Unique devices reporting telemetry</div>
      </div>

      {/* 3. Average Download */}
      <div className="kpi-card">
        <div className="kpi-top">
          <span className="kpi-label">Avg Downlink QoS</span>
          <div className="kpi-icon-box">
            <ArrowDown size={18} />
          </div>
        </div>
        <div className="kpi-number">
          {(stats?.avg_down_mbps || 0).toFixed(1)}
          <span className="kpi-unit">Mbps</span>
        </div>
        <div className="kpi-subtext">
          Avg Uplink: <b>{(stats?.avg_up_mbps || 0).toFixed(1)} Mbps</b> • Latency: <b>{Math.round(stats?.avg_latency_ms || 0)}ms</b>
        </div>
      </div>

      {/* 4. Top Telecom Operator */}
      <div className="kpi-card">
        <div className="kpi-top">
          <span className="kpi-label">Top Performer (5G)</span>
          <div className="kpi-icon-box">
            <Award size={18} />
          </div>
        </div>
        <div className="kpi-number" style={{ color: '#60A5FA' }}>
          {stats?.top_carrier || 'Airtel'}
        </div>
        <div className="kpi-subtext">Highest median throughput nationwide</div>
      </div>
    </div>
  );
};
