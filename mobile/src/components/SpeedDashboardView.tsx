import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { AppConfig } from '../types';
import { SpeedGauge } from './SpeedGauge';
import { MetricCard } from './MetricCard';
import { MonitorStatus } from '../services/monitorService';

interface SpeedDashboardViewProps {
  config: AppConfig | null;
  status: MonitorStatus;
  refreshing: boolean;
  isSyncing: boolean;
  onRefresh: () => void;
  onToggleMonitoring: () => void;
  onTestNow: () => void;
  onSyncPending: () => void;
}

export const SpeedDashboardView: React.FC<SpeedDashboardViewProps> = ({
  config,
  status,
  refreshing,
  isSyncing,
  onRefresh,
  onToggleMonitoring,
  onTestNow,
  onSyncPending,
}) => {
  const last = status.lastSample;
  const progress = status.currentProgress;

  let gaugeValue = last?.down_mbps ?? 0;
  let gaugeLabel = 'DOWNLOAD';
  let gaugeUnit = 'Mbps';
  let gaugeMax = 100;

  if (status.isTesting && progress) {
    if (progress.phase === 'ping') {
      gaugeLabel = 'PING';
      gaugeValue = progress.latency ?? 0;
      gaugeUnit = 'ms';
      gaugeMax = 200;
    } else if (progress.phase === 'upload') {
      gaugeLabel = 'UPLOAD';
      gaugeValue = progress.upSpeed ?? 0;
      gaugeUnit = 'Mbps';
      gaugeMax = 50;
    } else if (progress.phase === 'download') {
      gaugeLabel = 'DOWNLOAD';
      gaugeValue = progress.downSpeed ?? 0;
      gaugeUnit = 'Mbps';
      gaugeMax = 100;
    }
  }

  const formatLastTime = (ts: number | null) => {
    if (!ts) return 'Never';
    const date = new Date(ts * 1000);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#06B6D4"
          colors={['#06B6D4']}
        />
      }>
      {/* Status Bar Banner */}
      <View style={styles.statusBanner}>
        <View style={styles.statusIndicatorRow}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: status.isRunning ? '#10B981' : '#64748B' },
            ]}
          />
          <Text style={styles.statusText}>
            {status.isRunning ? 'MONITORING ACTIVE' : 'MONITORING IDLE'}
          </Text>
        </View>

        {status.pendingCount > 0 ? (
          <TouchableOpacity
            style={styles.pendingBadge}
            onPress={onSyncPending}
            disabled={isSyncing}>
            {isSyncing ? (
              <ActivityIndicator size="small" color="#F59E0B" />
            ) : (
              <Text style={styles.pendingBadgeText}>
                {status.pendingCount} Pending ⬆
              </Text>
            )}
          </TouchableOpacity>
        ) : (
          <View style={styles.syncedBadge}>
            <Text style={styles.syncedBadgeText}>All Synced ✓</Text>
          </View>
        )}
      </View>

      {/* Speed Gauge Display */}
      <View style={styles.gaugeContainer}>
        <SpeedGauge
          value={gaugeValue}
          maxValue={gaugeMax}
          label={gaugeLabel}
          unit={gaugeUnit}
          phase={progress?.phase || 'idle'}
          isTesting={status.isTesting}
        />

        {/* Test Progress Bar */}
        {status.isTesting && progress ? (
          <View style={styles.progressContainer}>
            <View style={styles.progressBarTrack}>
              <View
                style={[
                  styles.progressBarFill,
                  { width: `${progress.progressPercent || 10}%` },
                ]}
              />
            </View>
            <Text style={styles.progressMessage}>{progress.message}</Text>
          </View>
        ) : null}
      </View>

      {/* Primary Action Buttons */}
      <View style={styles.controlsRow}>
        <TouchableOpacity
          style={[
            styles.primaryBtn,
            status.isRunning ? styles.stopBtn : styles.startBtn,
          ]}
          onPress={onToggleMonitoring}
          activeOpacity={0.8}>
          <Text style={styles.primaryBtnText}>
            {status.isRunning ? 'STOP MONITOR' : 'START MONITOR'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.secondaryBtn, status.isTesting && styles.btnDisabled]}
          onPress={onTestNow}
          disabled={status.isTesting}
          activeOpacity={0.8}>
          {status.isTesting ? (
            <ActivityIndicator size="small" color="#06B6D4" />
          ) : (
            <Text style={styles.secondaryBtnText}>TEST NOW</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Telemetry Metrics Grid (TRAI QoS Compliant) */}
      <Text style={styles.sectionHeading}>SPEED & QUALITY OF SERVICE (QoS)</Text>
      <View style={styles.metricsGrid}>
        <MetricCard
          title="Download"
          value={last?.down_mbps != null ? last.down_mbps.toFixed(1) : '--'}
          unit="Mbps"
          accentColor="#06B6D4"
          subtitle="Throughput"
        />

        <MetricCard
          title="Upload"
          value={last?.up_mbps != null ? last.up_mbps.toFixed(1) : '--'}
          unit="Mbps"
          accentColor="#8B5CF6"
          subtitle="Throughput"
        />

        <MetricCard
          title="Latency"
          value={last?.latency_ms != null ? Math.round(last.latency_ms) : '--'}
          unit="ms"
          accentColor="#F59E0B"
          subtitle="Ping"
        />

        <MetricCard
          title="Jitter"
          value={last?.jitter_ms != null ? last.jitter_ms.toFixed(1) : '--'}
          unit="ms"
          accentColor="#EC4899"
          subtitle="Variance"
        />

        <MetricCard
          title="Packet Loss"
          value={last?.packet_loss_pct != null ? `${last.packet_loss_pct}` : '0'}
          unit="%"
          accentColor={last?.packet_loss_pct && last.packet_loss_pct > 0 ? '#EF4444' : '#10B981'}
          subtitle="Stability"
        />

        <MetricCard
          title="Network & TSP"
          value={last?.carrier ? last.carrier : (last?.network ? last.network.toUpperCase() : 'WIFI')}
          badge={last?.radio || (last?.network === 'wifi' ? 'Wi-Fi' : undefined)}
          accentColor="#10B981"
          subtitle={
            last?.carrier
              ? `${last.network?.toUpperCase() || 'NET'} • ${last.radio || 'Cellular'}`
              : (last?.radio ? `Radio: ${last.radio}` : 'Local Link')
          }
        />
      </View>

      {/* Location & Device Environment */}
      <View style={styles.infoCard}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>GPS Coordinates</Text>
          <Text style={styles.infoValue}>
            {last?.lat != null && last?.lng != null
              ? `${last.lat.toFixed(4)}, ${last.lng.toFixed(4)}`
              : 'Searching...'}
          </Text>
        </View>

        <View style={styles.infoDivider} />

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Environment</Text>
          <Text style={styles.infoValue}>
            {last?.location_type || 'Outdoor'} {last?.accuracy ? `(±${Math.round(last.accuracy)}m)` : ''}
          </Text>
        </View>

        <View style={styles.infoDivider} />

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Device & OS</Text>
          <Text style={styles.infoValue}>
            {last?.device_model || 'Mobile'} ({last?.os_platform || 'iOS/Android'})
          </Text>
        </View>

        <View style={styles.infoDivider} />

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Last Test / Interval</Text>
          <Text style={styles.infoValue}>
            {formatLastTime(last?.ts ?? null)} ({config ? `${config.testIntervalSeconds}s` : '5m'})
          </Text>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  statusBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#131B2E',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  statusIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#E2E8F0',
    letterSpacing: 0.8,
  },
  pendingBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: '#F59E0B',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  pendingBadgeText: {
    color: '#F59E0B',
    fontSize: 11,
    fontWeight: '700',
  },
  syncedBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  syncedBadgeText: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '700',
  },
  gaugeContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
  },
  progressContainer: {
    width: '85%',
    alignItems: 'center',
    marginTop: 4,
  },
  progressBarTrack: {
    width: '100%',
    height: 6,
    backgroundColor: '#1E293B',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#06B6D4',
    borderRadius: 3,
  },
  progressMessage: {
    fontSize: 12,
    color: '#38BDF8',
    fontWeight: '600',
    marginTop: 6,
  },
  controlsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  primaryBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  startBtn: {
    backgroundColor: '#06B6D4',
    shadowColor: '#06B6D4',
  },
  stopBtn: {
    backgroundColor: '#EF4444',
    shadowColor: '#EF4444',
  },
  primaryBtnText: {
    color: '#0F172A',
    fontWeight: '800',
    fontSize: 15,
    letterSpacing: 1,
  },
  secondaryBtn: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  secondaryBtnText: {
    color: '#38BDF8',
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  sectionHeading: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 1.2,
    marginBottom: 10,
    marginLeft: 4,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
    marginBottom: 14,
  },
  infoCard: {
    backgroundColor: '#131B2E',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  infoLabel: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 13,
    color: '#F8FAFC',
    fontWeight: '700',
    fontFamily: 'Courier',
  },
  infoDivider: {
    height: 1,
    backgroundColor: '#1E293B',
    marginVertical: 6,
  },
});
