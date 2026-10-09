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
import {
  DownloadIcon,
  UploadIcon,
  ClockIcon,
  WaveformIcon,
  ShieldIcon,
  AntennaIcon,
  PinIcon,
  ChevronRightIcon,
  PlayIcon,
  StopIcon,
  GaugeIcon,
} from './Icons';

interface SpeedDashboardViewProps {
  config: AppConfig | null;
  status: MonitorStatus;
  refreshing: boolean;
  onRefresh: () => void;
  onToggleMonitoring: () => void;
  onTestNow: () => void;
}

export const SpeedDashboardView: React.FC<SpeedDashboardViewProps> = ({
  config,
  status,
  refreshing,
  onRefresh,
  onToggleMonitoring,
  onTestNow,
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

  const carrierName =
    last?.carrier && last.carrier !== '--' && last.carrier !== 'wifi'
      ? last.carrier
      : last?.network === 'wifi'
      ? 'Wi-Fi'
      : last?.radio || 'Cellular';

  const networkBadge = last?.network === 'wifi' ? 'Wi-Fi' : last?.radio || 'Mobile';

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#00A389"
          colors={['#00A389']}
        />
      }>
      {/* Top Gauge Card (Option A Theme) */}
      <View style={styles.gaugeCard}>
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
                  { width: `${progress.progressPercent || 15}%` },
                ]}
              />
            </View>
            <Text style={styles.progressMessage}>{progress.message}</Text>
          </View>
        ) : null}

        {/* Action Buttons Row */}
        <View style={styles.actionButtonsRow}>
          <TouchableOpacity
            style={[
              styles.startMonitoringBtn,
              status.isRunning ? styles.stopMonitoringBtn : null,
            ]}
            onPress={onToggleMonitoring}
            activeOpacity={0.85}>
            {status.isRunning ? (
              <StopIcon size={15} color="#FFFFFF" />
            ) : (
              <PlayIcon size={14} color="#FFFFFF" />
            )}
            <Text style={styles.startBtnText}>
              {status.isRunning ? 'Stop Monitoring' : 'Start Monitoring'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.testNowBtn, status.isTesting && styles.btnDisabled]}
            onPress={onTestNow}
            disabled={status.isTesting}
            activeOpacity={0.85}>
            {status.isTesting ? (
              <ActivityIndicator size="small" color="#00A389" />
            ) : (
              <>
                <GaugeIcon size={16} color="#1E293B" />
                <Text style={styles.testNowBtnText}>Test Now</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* QoS Section Heading */}
      <View style={styles.sectionHeadingRow}>
        <Text style={styles.sectionHeading}>Speed & Quality of Service (QoS)</Text>
      </View>

      {/* QoS 2-Column Metrics Grid */}
      <View style={styles.metricsGrid}>
        <MetricCard
          title="Download"
          value={last?.down_mbps != null ? last.down_mbps.toFixed(1) : '--'}
          unit="Mbps"
          accentColor="#0284C7"
          iconBgColor="#E0F2FE"
          subtitle="Throughput"
          icon={<DownloadIcon size={16} color="#0284C7" />}
        />

        <MetricCard
          title="Upload"
          value={last?.up_mbps != null ? last.up_mbps.toFixed(1) : '--'}
          unit="Mbps"
          accentColor="#7C3AED"
          iconBgColor="#EDE9FE"
          subtitle="Throughput"
          icon={<UploadIcon size={16} color="#7C3AED" />}
        />

        <MetricCard
          title="Latency"
          value={last?.latency_ms != null ? Math.round(last.latency_ms) : '--'}
          unit="ms"
          accentColor="#D97706"
          iconBgColor="#FEF3C7"
          subtitle="Ping"
          icon={<ClockIcon size={16} color="#D97706" />}
        />

        <MetricCard
          title="Jitter"
          value={last?.jitter_ms != null ? last.jitter_ms.toFixed(1) : '--'}
          unit="ms"
          accentColor="#DB2777"
          iconBgColor="#FCE7F3"
          subtitle="Variance"
          icon={<WaveformIcon size={16} color="#DB2777" />}
        />

        <MetricCard
          title="Packet Loss"
          value={last?.packet_loss_pct != null ? `${last.packet_loss_pct}` : '0'}
          unit="%"
          accentColor={last?.packet_loss_pct && last.packet_loss_pct > 0 ? '#EF4444' : '#059669'}
          iconBgColor={last?.packet_loss_pct && last.packet_loss_pct > 0 ? '#FEE2E2' : '#D1FAE5'}
          subtitle="Stability"
          icon={
            <ShieldIcon
              size={16}
              color={last?.packet_loss_pct && last.packet_loss_pct > 0 ? '#EF4444' : '#059669'}
            />
          }
        />

        <MetricCard
          title="Network & ISP"
          value={carrierName}
          badge={networkBadge}
          accentColor="#00A389"
          iconBgColor="#CCFBF1"
          subtitle={
            last?.network === 'wifi'
              ? `${carrierName} • Wi-Fi`
              : `${carrierName} • ${last?.radio || 'Cellular'}`
          }
          icon={<AntennaIcon size={16} color="#00A389" />}
        />
      </View>

      {/* GPS Coordinates Card */}
      <View style={styles.gpsCard}>
        <View style={styles.gpsLeft}>
          <View style={styles.gpsIconCircle}>
            <PinIcon size={16} color="#0284C7" />
          </View>
          <View>
            <Text style={styles.gpsLabel}>GPS Coordinates</Text>
            <Text style={styles.gpsValue}>
              {last?.lat != null && last?.lng != null
                ? `${last.lat.toFixed(4)}, ${last.lng.toFixed(4)}`
                : 'Acquiring GPS...'}
            </Text>
          </View>
        </View>
        <ChevronRightIcon size={18} color="#94A3B8" />
      </View>

      {/* Environment & Device Details Card */}
      <View style={styles.detailsCard}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Environment</Text>
          <Text style={styles.detailValue}>
            {last?.location_type || 'Outdoor'} {last?.accuracy ? `(±${Math.round(last.accuracy)}m)` : ''}
          </Text>
        </View>
        <View style={styles.detailDivider} />
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Device & OS</Text>
          <Text style={styles.detailValue}>
            {last?.device_model || 'Mobile'} ({last?.os_platform || 'iOS/Android'})
          </Text>
        </View>
        <View style={styles.detailDivider} />
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Last Test / Cadence</Text>
          <Text style={styles.detailValue}>
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
    backgroundColor: '#F4F6FA',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  gaugeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E8EDF2',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
    marginBottom: 16,
    alignItems: 'center',
  },
  progressContainer: {
    width: '90%',
    alignItems: 'center',
    marginVertical: 10,
  },
  progressBarTrack: {
    width: '100%',
    height: 6,
    backgroundColor: '#E2E8F0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#00A389',
    borderRadius: 3,
  },
  progressMessage: {
    fontSize: 12,
    color: '#00A389',
    fontWeight: '600',
    marginTop: 6,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    width: '100%',
    marginTop: 14,
    gap: 12,
  },
  startMonitoringBtn: {
    flex: 1.3,
    backgroundColor: '#00A389',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 14,
    gap: 8,
    shadowColor: '#00A389',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  stopMonitoringBtn: {
    backgroundColor: '#EF4444',
    shadowColor: '#EF4444',
  },
  startBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  testNowBtn: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 14,
    gap: 6,
  },
  testNowBtnText: {
    color: '#1E293B',
    fontWeight: '700',
    fontSize: 14,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  sectionHeadingRow: {
    marginBottom: 10,
    marginTop: 4,
    paddingHorizontal: 2,
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
    letterSpacing: -0.2,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -5,
    marginBottom: 10,
  },
  gpsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: '#E8EDF2',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  gpsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  gpsIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gpsLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  gpsValue: {
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '700',
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  detailsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E8EDF2',
    marginBottom: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  detailLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 12,
    color: '#0F172A',
    fontWeight: '700',
  },
  detailDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 6,
  },
});
