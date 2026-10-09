import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { Sample } from '../types';
import { sampleStore } from '../services/sampleStore';
import { exportSamplesAsCSV, exportSamplesAsJSON } from '../utils/exportUtils';
import {
  DownloadIcon,
  UploadIcon,
  ClockIcon,
  WaveformIcon,
  ChevronRightIcon,
} from './Icons';

interface HistoryViewProps {
  samples: Sample[];
  onRefresh: () => void;
  onNavigateTab?: (tab: 'SPEED' | 'MAP' | 'HISTORY' | 'SETTINGS') => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  samples,
  onRefresh,
  onNavigateTab,
}) => {
  const [selectedFilter, setSelectedFilter] = useState('ALL');
  const [displayLimit] = useState<number | 'ALL'>(50);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [capacityInfo, setCapacityInfo] = useState<{
    count: number;
    maxLimit: number;
    isFull: boolean;
    usagePercent: number;
  }>({
    count: samples.length,
    maxLimit: sampleStore.getMaxHistoryLimit(),
    isFull: samples.length >= sampleStore.getMaxHistoryLimit(),
    usagePercent: Math.min(100, Math.round((samples.length / sampleStore.getMaxHistoryLimit()) * 100)),
  });

  useEffect(() => {
    sampleStore.getCapacityInfo().then(setCapacityInfo);
  }, [samples]);

  // Compute aggregate statistics for the 4-column strip
  const summary = useMemo(() => {
    if (samples.length === 0) {
      return { total: 0, avgDown: 0, avgUp: 0, avgPing: 0 };
    }
    let sumDown = 0;
    let sumUp = 0;
    let sumPing = 0;
    let pingCount = 0;

    samples.forEach(s => {
      if (s.down_mbps != null) sumDown += s.down_mbps;
      if (s.up_mbps != null) sumUp += s.up_mbps;
      if (s.latency_ms != null) {
        sumPing += s.latency_ms;
        pingCount++;
      }
    });

    return {
      total: samples.length,
      avgDown: parseFloat((sumDown / samples.length).toFixed(1)),
      avgUp: parseFloat((sumUp / samples.length).toFixed(1)),
      avgPing: pingCount > 0 ? Math.round(sumPing / pingCount) : 0,
    };
  }, [samples]);

  // Filter list by network/carrier
  const filteredSamples = useMemo(() => {
    let result = samples;
    if (selectedFilter === 'WI-FI') result = samples.filter(s => s.network === 'wifi');
    else if (selectedFilter === '5G') result = samples.filter(s => s.radio?.includes('5G'));
    else if (selectedFilter === '4G') result = samples.filter(s => s.radio?.includes('4G') || s.radio?.includes('LTE'));
    else if (selectedFilter === 'JIO') result = samples.filter(s => s.carrier?.toLowerCase().includes('jio'));
    else if (selectedFilter === 'AIRTEL') result = samples.filter(s => s.carrier?.toLowerCase().includes('airtel'));
    else if (selectedFilter === 'BSNL') result = samples.filter(s => s.carrier?.toLowerCase().includes('bsnl'));

    // Apply display limit
    if (displayLimit !== 'ALL' && typeof displayLimit === 'number') {
      return result.slice(0, displayLimit);
    }
    return result;
  }, [samples, selectedFilter, displayLimit]);

  // Group or date label
  const latestDateLabel = useMemo(() => {
    if (samples.length === 0) return 'Recent History';
    const firstDate = new Date(samples[0].ts * 1000);
    return firstDate.toLocaleDateString([], {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }, [samples]);

  const handleExportPrompt = () => {
    if (samples.length === 0) {
      Alert.alert('No Data', 'No test samples available to export.');
      return;
    }

    Alert.alert(
      'Export Test History',
      `Export ${samples.length} test records to your device:`,
      [
        {
          text: '📊 Export as CSV (Spreadsheet)',
          onPress: () => exportSamplesAsCSV(samples),
        },
        {
          text: '📄 Export as JSON',
          onPress: () => exportSamplesAsJSON(samples),
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const handleClearHistory = () => {
    if (samples.length === 0) return;

    Alert.alert(
      'Clear Sample History',
      `You have ${samples.length} test records stored. Would you like to export a backup before clearing?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: '📤 Export & Clear',
          onPress: async () => {
            await exportSamplesAsCSV(samples);
            await sampleStore.clearAll();
            onRefresh();
          },
        },
        {
          text: '🗑 Clear All',
          style: 'destructive',
          onPress: async () => {
            await sampleStore.clearAll();
            onRefresh();
          },
        },
      ]
    );
  };

  const formatTime = (epochSec: number) => {
    const d = new Date(epochSec * 1000);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const filterChips = ['ALL', '5G', '4G', 'WI-FI', 'JIO', 'AIRTEL', 'BSNL'];

  const renderItem = ({ item }: { item: Sample }) => {
    const isExpanded = expandedId === item.id;
    const carrier =
      item.carrier && item.carrier !== '--' && item.carrier !== 'wifi'
        ? item.carrier
        : item.network === 'wifi'
        ? 'Wi-Fi'
        : item.radio || 'Cellular';

    const pillLabel =
      item.network === 'wifi'
        ? `${carrier} • Wi-Fi`
        : item.radio
        ? `${carrier} • ${item.radio}`
        : carrier;

    return (
      <TouchableOpacity
        style={styles.recordCard}
        activeOpacity={0.85}
        onPress={() => setExpandedId(isExpanded ? null : item.id)}>
        {/* Top Header Row (Time, Pills, Chevron) */}
        <View style={styles.cardHeader}>
          <Text style={styles.timeText}>{formatTime(item.ts)}</Text>

          <View style={styles.badgeRow}>
            <View style={styles.carrierPill}>
              <Text style={styles.carrierPillText}>{pillLabel}</Text>
            </View>

            {item.location_type ? (
              <View style={styles.envPill}>
                <Text style={styles.envPillText}>{item.location_type}</Text>
              </View>
            ) : null}
          </View>

          <View style={[styles.chevronBox, isExpanded && styles.chevronRotated]}>
            <ChevronRightIcon size={16} color="#94A3B8" />
          </View>
        </View>

        {/* 4-Metrics Quick Columns */}
        <View style={styles.metricsRow}>
          <View style={styles.metricItem}>
            <DownloadIcon size={14} color="#0284C7" />
            <Text style={styles.metricVal}>
              {item.down_mbps != null ? item.down_mbps.toFixed(1) : '--'}
            </Text>
            <Text style={styles.metricUnit}>Mbps</Text>
          </View>

          <View style={styles.metricItem}>
            <UploadIcon size={14} color="#7C3AED" />
            <Text style={styles.metricVal}>
              {item.up_mbps != null ? item.up_mbps.toFixed(1) : '--'}
            </Text>
            <Text style={styles.metricUnit}>Mbps</Text>
          </View>

          <View style={styles.metricItem}>
            <ClockIcon size={14} color="#D97706" />
            <Text style={styles.metricVal}>
              {item.latency_ms != null ? Math.round(item.latency_ms) : '--'}
            </Text>
            <Text style={styles.metricUnit}>ms</Text>
          </View>

          <View style={styles.metricItem}>
            <WaveformIcon size={14} color="#DB2777" />
            <Text style={styles.metricVal}>
              {item.jitter_ms != null ? item.jitter_ms.toFixed(1) : '--'}
            </Text>
            <Text style={styles.metricUnit}>ms</Text>
          </View>
        </View>

        {/* Expanded Info Drawer */}
        {isExpanded && (
          <View style={styles.expandedDrawer}>
            {item.lat != null && item.lng != null && (
              <Text style={styles.expandedText}>
                📍 GPS: {item.lat.toFixed(5)}, {item.lng.toFixed(5)}{' '}
                {item.accuracy ? `(±${Math.round(item.accuracy)}m)` : ''}
              </Text>
            )}
            <Text style={styles.expandedText}>
              📱 Device: {item.device_model || 'Mobile'} ({item.os_platform || 'OS'})
            </Text>
            <Text style={styles.expandedText}>
              🛡️ Packet Loss: {item.packet_loss_pct ?? 0}%
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Top Segmented Sub-Nav: Overview | Map | History (Option C Style) */}
      <View style={styles.topSegmentedRow}>
        <TouchableOpacity
          style={styles.segmentedTab}
          onPress={() => onNavigateTab && onNavigateTab('SPEED')}>
          <Text style={styles.segmentedTabText}>Overview</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.segmentedTab}
          onPress={() => onNavigateTab && onNavigateTab('MAP')}>
          <Text style={styles.segmentedTabText}>Map</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.segmentedTab, styles.segmentedTabActive]}>
          <Text style={styles.segmentedTabTextActive}>History</Text>
        </TouchableOpacity>
      </View>

      {/* Summary KPI Strip (Total Tests, Avg Download, Avg Upload, Avg Ping) */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{summary.total}</Text>
          <Text style={styles.summaryLabel}>Total Tests</Text>
        </View>

        <View style={styles.summaryDivider} />

        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>
            {summary.avgDown > 0 ? summary.avgDown : '--'}
          </Text>
          <Text style={styles.summaryLabel}>Avg Download</Text>
          <Text style={styles.summarySubLabel}>(Mbps)</Text>
        </View>

        <View style={styles.summaryDivider} />

        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>
            {summary.avgUp > 0 ? summary.avgUp : '--'}
          </Text>
          <Text style={styles.summaryLabel}>Avg Upload</Text>
          <Text style={styles.summarySubLabel}>(Mbps)</Text>
        </View>

        <View style={styles.summaryDivider} />

        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>
            {summary.avgPing > 0 ? summary.avgPing : '--'}
          </Text>
          <Text style={styles.summaryLabel}>Avg Ping</Text>
          <Text style={styles.summarySubLabel}>(ms)</Text>
        </View>
      </View>

      {/* Filter Chips Carousel */}
      <View style={styles.filterBar}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={filterChips}
          keyExtractor={item => item}
          renderItem={({ item }) => {
            const isActive = selectedFilter === item;
            return (
              <TouchableOpacity
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                onPress={() => setSelectedFilter(item)}>
                <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                  {item === 'WI-FI' ? 'Wi-Fi' : item}
                </Text>
              </TouchableOpacity>
            );
          }}
          contentContainerStyle={styles.filterContent}
        />
      </View>

      {/* Date Header Strip */}
      <View style={styles.dateHeaderRow}>
        <Text style={styles.dateHeaderText}>{latestDateLabel}</Text>
        <Text style={styles.recordCountText}>
          {filteredSamples.length} {filteredSamples.length === 1 ? 'Record' : 'Records'}
        </Text>
      </View>

      {/* Capacity Strip Warning (if full) */}
      {capacityInfo.isFull && (
        <View style={styles.capacityWarning}>
          <Text style={styles.capacityWarningText}>
            ⚠️ Capacity reached ({capacityInfo.count}/{capacityInfo.maxLimit}). Auto-depleting oldest entries.
          </Text>
          <TouchableOpacity onPress={handleExportPrompt}>
            <Text style={styles.capacityExportLink}>Backup</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Main History Records List */}
      {filteredSamples.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📊</Text>
          <Text style={styles.emptyTitle}>No Test Records</Text>
          <Text style={styles.emptySubtitle}>
            Run speed tests to record telemetry metrics.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredSamples}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Bottom Action Footer */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.exportBtn, samples.length === 0 && styles.btnDisabled]}
          onPress={handleExportPrompt}
          disabled={samples.length === 0}>
          <Text style={styles.exportBtnText}>📤 Export CSV/JSON</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, styles.clearBtn, samples.length === 0 && styles.btnDisabled]}
          onPress={handleClearHistory}
          disabled={samples.length === 0}>
          <Text style={styles.clearBtnText}>🗑 Clear</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.actionBtn, styles.refreshBtn]} onPress={onRefresh}>
          <Text style={styles.refreshBtnText}>🔄 Refresh</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F6FA',
  },
  topSegmentedRow: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 24,
    padding: 3,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 10,
  },
  segmentedTab: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  segmentedTabActive: {
    backgroundColor: '#00A389',
    shadowColor: '#00A389',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  segmentedTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  segmentedTabTextActive: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#E8EDF2',
    alignItems: 'center',
    justifyContent: 'space-around',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  summaryItem: {
    alignItems: 'center',
    flex: 1,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    fontVariant: ['tabular-nums'],
  },
  summaryLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
    textAlign: 'center',
  },
  summarySubLabel: {
    fontSize: 8,
    color: '#94A3B8',
    marginTop: 1,
  },
  summaryDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#E2E8F0',
  },
  filterBar: {
    marginBottom: 8,
  },
  filterContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterChipActive: {
    backgroundColor: '#00A389',
    borderColor: '#00A389',
  },
  filterChipText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  dateHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    marginVertical: 4,
  },
  dateHeaderText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  recordCountText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '500',
  },
  capacityWarning: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#F59E0B',
    borderRadius: 10,
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  capacityWarningText: {
    color: '#92400E',
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
  capacityExportLink: {
    color: '#B45309',
    fontSize: 11,
    fontWeight: '800',
    marginLeft: 6,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 24,
  },
  recordCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E8EDF2',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 5,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  timeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
    marginRight: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  carrierPill: {
    backgroundColor: '#CCFBF1',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  carrierPillText: {
    color: '#0F766E',
    fontSize: 10,
    fontWeight: '700',
  },
  envPill: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  envPillText: {
    color: '#059669',
    fontSize: 10,
    fontWeight: '600',
  },
  chevronBox: {
    padding: 2,
  },
  chevronRotated: {
    transform: [{ rotate: '90deg' }],
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  metricItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  metricVal: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    fontVariant: ['tabular-nums'],
  },
  metricUnit: {
    fontSize: 10,
    fontWeight: '500',
    color: '#64748B',
  },
  expandedDrawer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    gap: 3,
  },
  expandedText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  emptyIcon: {
    fontSize: 44,
    marginBottom: 8,
  },
  emptyTitle: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptySubtitle: {
    color: '#64748B',
    fontSize: 12,
    textAlign: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E8EDF2',
    gap: 8,
  },
  actionBtn: {
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exportBtn: {
    flex: 1.4,
    backgroundColor: '#E0F2FE',
  },
  exportBtnText: {
    color: '#0284C7',
    fontSize: 11,
    fontWeight: '700',
  },
  clearBtn: {
    flex: 0.8,
    backgroundColor: '#FEE2E2',
  },
  clearBtnText: {
    color: '#DC2626',
    fontSize: 11,
    fontWeight: '700',
  },
  refreshBtn: {
    flex: 0.8,
    backgroundColor: '#F1F5F9',
  },
  refreshBtnText: {
    color: '#1E293B',
    fontSize: 11,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.4,
  },
});
