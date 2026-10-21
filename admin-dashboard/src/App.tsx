import { useState, useEffect } from 'react';
import {
  Activity,
  MapPin,
  Smartphone,
  Table,
  RotateCw,
  FileSpreadsheet,
  Gauge,
} from 'lucide-react';
import type {
  AdminStats,
  OperatorAnalytics,
  DeviceSummary,
  TelemetrySample,
} from './types';
import { KPICards } from './components/KPICards';
import { OperatorBenchmarks } from './components/OperatorBenchmarks';
import { CoverageMap } from './components/CoverageMap';
import { DevicesDirectory } from './components/DevicesDirectory';
import { TelemetryTable } from './components/TelemetryTable';

type TabType = 'overview' | 'map' | 'devices' | 'telemetry';

export function App() {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Live Data State
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [operatorAnalytics, setOperatorAnalytics] = useState<OperatorAnalytics[]>([]);
  const [devices, setDevices] = useState<DeviceSummary[]>([]);
  const [samples, setSamples] = useState<TelemetrySample[]>([]);

  // Telemetry Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [carrierFilter, setCarrierFilter] = useState<string>('');
  const [radioFilter, setRadioFilter] = useState<string>('');
  const [testTypeFilter, setTestTypeFilter] = useState<string>('');

  // Fetch KPI Stats
  const fetchStats = async () => {
    try {
      const res = await fetch('/v1/admin/stats');
      if (res.ok) setStats(await res.json());
    } catch (e) {
      console.error('Failed to load stats', e);
    }
  };

  // Fetch Operator Analytics
  const fetchOperatorAnalytics = async () => {
    try {
      const res = await fetch('/v1/admin/operator-analytics');
      if (res.ok) setOperatorAnalytics(await res.json());
    } catch (e) {
      console.error('Failed to load operator analytics', e);
    }
  };

  // Fetch Devices Directory
  const fetchDevices = async () => {
    try {
      const res = await fetch('/v1/admin/devices');
      if (res.ok) setDevices(await res.json());
    } catch (e) {
      console.error('Failed to load devices', e);
    }
  };

  // Fetch Filtered Telemetry Samples
  const fetchSamples = async () => {
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (searchQuery) params.append('search', searchQuery);
      if (carrierFilter) params.append('carrier', carrierFilter);
      if (radioFilter) params.append('radio', radioFilter);
      if (testTypeFilter) params.append('test_type', testTypeFilter);

      const res = await fetch(`/v1/admin/samples?${params.toString()}`);
      if (res.ok) setSamples(await res.json());
    } catch (e) {
      console.error('Failed to load samples', e);
    }
  };

  // Fetch All Data
  const loadAllData = async () => {
    setIsLoading(true);
    await Promise.all([
      fetchStats(),
      fetchOperatorAnalytics(),
      fetchDevices(),
      fetchSamples(),
    ]);
    setIsLoading(false);
  };

  useEffect(() => {
    loadAllData();
    const interval = setInterval(loadAllData, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, [searchQuery, carrierFilter, radioFilter, testTypeFilter]);

  // Handle Device Click from Devices Tab -> Filter Telemetry
  const handleSelectDevice = (deviceId: string) => {
    setSearchQuery(deviceId);
    setActiveTab('telemetry');
  };

  const handleExportCSV = () => {
    window.location.href = '/v1/admin/export';
  };

  return (
    <div className="dashboard-container">
      {/* Header */}
      <header className="app-header">
        <div className="brand-wrapper">
          <div className="brand-logo-icon">
            <Gauge size={26} />
          </div>
          <div className="brand-info">
            <h1>TRAI MySpeed</h1>
            <p>Telecom QoS & Crowdsourced Network Command Center</p>
          </div>
        </div>

        <div className="header-right-actions">
          <div className="live-badge">
            <div className="live-dot" /> LIVE AUTO-SYNC
          </div>

          <button
            className="btn btn-secondary"
            onClick={loadAllData}
            title="Refresh dashboard metrics"
          >
            <RotateCw size={14} className={isLoading ? 'animate-spin' : ''} /> Refresh
          </button>

          <button className="btn btn-primary" onClick={handleExportCSV}>
            <FileSpreadsheet size={14} /> Export CSV
          </button>
        </div>
      </header>

      {/* Top Metric Cards */}
      <KPICards stats={stats} />

      {/* Navigation Tabs (Mobile-inspired theme) */}
      <div className="nav-tabs-wrapper">
        <button
          className={`nav-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <Activity size={16} /> Overview & Benchmark
        </button>

        <button
          className={`nav-tab-btn ${activeTab === 'map' ? 'active' : ''}`}
          onClick={() => setActiveTab('map')}
        >
          <MapPin size={16} /> Crowdsourced Coverage Map
        </button>

        <button
          className={`nav-tab-btn ${activeTab === 'devices' ? 'active' : ''}`}
          onClick={() => setActiveTab('devices')}
        >
          <Smartphone size={16} /> Users & Devices ({devices.length})
        </button>

        <button
          className={`nav-tab-btn ${activeTab === 'telemetry' ? 'active' : ''}`}
          onClick={() => setActiveTab('telemetry')}
        >
          <Table size={16} /> Live Telemetry Feed
        </button>
      </div>

      {/* Tab 1: Overview & Benchmarks */}
      {activeTab === 'overview' && (
        <div>
          <OperatorBenchmarks analytics={operatorAnalytics} />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
            <div className="dashboard-card">
              <div className="card-title-row">
                <div className="card-title-text">
                  <MapPin size={18} color="#00A389" /> Coverage Map Snapshot
                </div>
                <button
                  className="btn btn-secondary"
                  style={{ padding: '4px 10px', fontSize: '11px' }}
                  onClick={() => setActiveTab('map')}
                >
                  Open Full Map
                </button>
              </div>
              <CoverageMap />
            </div>

            <div className="dashboard-card">
              <div className="card-title-row">
                <div className="card-title-text">
                  <Table size={18} color="#00A389" /> Recent Ingestion Activity
                </div>
                <button
                  className="btn btn-secondary"
                  style={{ padding: '4px 10px', fontSize: '11px' }}
                  onClick={() => setActiveTab('telemetry')}
                >
                  View All ({samples.length})
                </button>
              </div>
              <TelemetryTable
                samples={samples.slice(0, 5)}
                searchQuery=""
                onSearchChange={() => {}}
                carrierFilter=""
                onCarrierChange={() => {}}
                radioFilter=""
                onRadioChange={() => {}}
                testTypeFilter=""
                onTestTypeChange={() => {}}
              />
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Crowdsource Coverage Map */}
      {activeTab === 'map' && (
        <div className="dashboard-card">
          <div className="card-title-row">
            <div className="card-title-text">
              <MapPin size={20} color="#00A389" /> India Crowdsourced Network Performance & Coverage Map
            </div>
          </div>
          <CoverageMap />
        </div>
      )}

      {/* Tab 3: Users & Devices Directory */}
      {activeTab === 'devices' && (
        <DevicesDirectory
          devices={devices}
          onSelectDevice={handleSelectDevice}
        />
      )}

      {/* Tab 4: Live Telemetry Feed */}
      {activeTab === 'telemetry' && (
        <TelemetryTable
          samples={samples}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          carrierFilter={carrierFilter}
          onCarrierChange={setCarrierFilter}
          radioFilter={radioFilter}
          onRadioChange={setRadioFilter}
          testTypeFilter={testTypeFilter}
          onTestTypeChange={setTestTypeFilter}
        />
      )}
    </div>
  );
}

export default App;
