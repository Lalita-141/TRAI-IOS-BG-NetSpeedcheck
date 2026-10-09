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

interface HistoryViewProps {
  samples: Sample[];
  onRefresh: () => void;
  onNavigateToSettings?: () => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  samples,
  onRefresh,
}) => {
  const [selectedFilter, setSelectedFilter] = useState('ALL');
  const [displayLimit, setDisplayLimit] = useState<number | 'ALL'>(50);
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

  // Compute aggregate statistics
  const summary = useMemo(() => {
    if (samples.length === 0) {
      return { total: 0, avgDown: 0, avgUp: 0, bestPing: 0, avgJitter: 0 };
    }
    let sumDown = 0;
    let sumUp = 0;
    let bestPing = Infinity;
    let sumJitter = 0;
    let jitterCount = 0;

    samples.forEach(s => {
      if (s.down_mbps != null) sumDown += s.down_mbps;
      if (s.up_mbps != null) sumUp += s.up_mbps;
      if (s.latency_ms != null && s.latency_ms < bestPing) bestPing = s.latency_ms;
      if (s.jitter_ms != null) {
        sumJitter += s.jitter_ms;
        jitterCount++;
      }
    });

    return {
      total: samples.length,
      avgDown: parseFloat((sumDown / samples.length).toFixed(1)),
      avgUp: parseFloat((sumUp / samples.length).toFixed(1)),
      bestPing: bestPing === Infinity ? 0 : Math.round(bestPing),
      avgJitter: jitterCount > 0 ? parseFloat((sumJitter / jitterCount).toFixed(1)) : 0,
    };
  }, [samples]);

  // Filter list by network/carrier
  const filteredSamples = useMemo(() => {
    let result = samples;
    if (selectedFilter === 'WI-FI') result = samples.filter(s => s.network === 'wifi');
    else if (selectedFilter === 'CELLULAR') result = samples.filter(s => s.network === 'cellular');
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

  // Handle Export Options
  const handleExportPrompt = () => {
    if (samples.length === 0) {
      Alert.alert('No Data', 'No test samples available to export.');
      return;
    }

    Alert.alert(
      'Export Test History',
      `Export ${samples.length} test records to your device or share:`,
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

  // Handle Clear History with Safe Export Prompt
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

  const formatDate = (epochSec: number) => {
    const d = new Date(epochSec * 1000);
    return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  const filterChips = ['ALL', '5G', '4G', 'WI-FI', 'JIO', 'AIRTEL', 'BSNL'];
  const limitOptions: (number | 'ALL')[] = [25, 50, 100, 250, 'ALL'];

  const renderItem = ({ item }: { item: Sample }) => {
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.badgeRow}>
            <View style={styles.carrierBadge}>
              <Text style={styles.carrierBadgeText}>
                {item.carrier && item.carrier !== '--' && item.carrier !== 'wifi'
                  ? item.carrier
                  : item.network === 'wifi'
                  ? 'Wi-Fi'
                  : item.radio || 'Cellular'}
              </Text>
            </View>
            {item.network === 'wifi' && item.carrier && item.carrier !== 'Wi-Fi' ? (
              <View style={[styles.radioBadge, { backgroundColor: 'rgba(6, 182, 212, 0.15)' }]}>
                <Text style={[styles.radioBadgeText, { color: '#06B6D4' }]}>Wi-Fi</Text>
              </View>
            ) : item.radio && item.network !== 'wifi' ? (
              <View style={styles.radioBadge}>
                <Text style={styles.radioBadgeText}>{item.radio}</Text>
              </View>
            ) : null}
            {item.location_type ? (
              <View style={styles.envBadge}>
                <Text style={styles.envBadgeText}>{item.location_type}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.timeText}>{formatDate(item.ts)}</Text>
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>DOWNLOAD</Text>
            <Text style={[styles.metricVal, { color: '#06B6D4' }]}>
              {item.down_mbps != null ? item.down_mbps.toFixed(1) : '--'}
              <Text style={styles.metricUnit}> Mbps</Text>
            </Text>
          </View>

          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>UPLOAD</Text>
            <Text style={[styles.metricVal, { color: '#8B5CF6' }]}>
              {item.up_mbps != null ? item.up_mbps.toFixed(1) : '--'}
              <Text style={styles.metricUnit}> Mbps</Text>
            </Text>
          </View>

          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>PING</Text>
            <Text style={[styles.metricVal, { color: '#F59E0B' }]}>
              {item.latency_ms != null ? Math.round(item.latency_ms) : '--'}
              <Text style={styles.metricUnit}> ms</Text>
            </Text>
          </View>

          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>JITTER</Text>
            <Text style={[styles.metricVal, { color: '#EC4899' }]}>
              {item.jitter_ms != null ? item.jitter_ms.toFixed(1) : '--'}
              <Text style={styles.metricUnit}> ms</Text>
            </Text>
          </View>
        </View>

        {item.lat != null && item.lng != null ? (
          <View style={styles.locationFooter}>
            <Text style={styles.coordsText}>
              📍 {item.lat.toFixed(5)}, {item.lng.toFixed(5)}
              {item.accuracy != null ? ` (±${Math.round(item.accuracy)}m)` : ''}
            </Text>
            <Text style={styles.deviceText}>
              {item.device_model || 'Mobile'} • {item.packet_loss_pct ?? 0}% Loss
            </Text>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Capacity & Auto-Depletion Banner */}
      {capacityInfo.isFull ? (
        <View style={styles.capacityWarningCard}>
          <View style={styles.warningHeaderRow}>
            <Text style={styles.warningTitle}>⚠️ Capacity Reached ({capacityInfo.count}/{capacityInfo.maxLimit})</Text>
            <TouchableOpacity onPress={handleExportPrompt} style={styles.warningExportBtn}>
              <Text style={styles.warningExportBtnText}>📤 Backup</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.warningDesc}>
            New tests will auto-deplete (overwrite) the oldest entries. You can export a backup or raise capacity in Settings.
          </Text>
        </View>
      ) : (
        <View style={styles.storageStatusStrip}>
          <Text style={styles.storageStatusText}>
            💾 Local Store: <Text style={styles.storageStatusHighlight}>{capacityInfo.count} / {capacityInfo.maxLimit}</Text> entries (auto-rotates when full)
          </Text>
        </View>
      )}

      {/* Summary KPI Cards Strip */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>TOTAL TESTS</Text>
          <Text style={styles.summaryValue}>{summary.total}</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>AVG DOWNLOAD</Text>
          <Text style={[styles.summaryValue, { color: '#06B6D4' }]}>
            {summary.avgDown > 0 ? `${summary.avgDown} M` : '--'}
          </Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>AVG UPLOAD</Text>
          <Text style={[styles.summaryValue, { color: '#8B5CF6' }]}>
            {summary.avgUp > 0 ? `${summary.avgUp} M` : '--'}
          </Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>BEST PING</Text>
          <Text style={[styles.summaryValue, { color: '#10B981' }]}>
            {summary.bestPing > 0 ? `${summary.bestPing}ms` : '--'}
          </Text>
        </View>
      </View>

      {/* Display Limit & Visibility Bar */}
      <View style={styles.controlSection}>
        <View style={styles.displayLimitRow}>
          <Text style={styles.controlLabel}>
            VIEW: <Text style={styles.controlCounter}>Showing {filteredSamples.length} of {samples.length}</Text>
          </Text>
          <View style={styles.limitPillsContainer}>
            {limitOptions.map(opt => (
              <TouchableOpacity
                key={String(opt)}
                style={[
                  styles.limitPill,
                  displayLimit === opt && styles.limitPillActive,
                ]}
                onPress={() => setDisplayLimit(opt)}>
                <Text
                  style={[
                    styles.limitPillText,
                    displayLimit === opt && styles.limitPillTextActive,
                  ]}>
                  {opt === 'ALL' ? 'All' : opt}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* Filter Chips Carousel */}
      <View style={styles.filterBar}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={filterChips}
          keyExtractor={item => item}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.filterChip,
                selectedFilter === item && styles.filterChipActive,
              ]}
              onPress={() => setSelectedFilter(item)}>
              <Text
                style={[
                  styles.filterChipText,
                  selectedFilter === item && styles.filterChipTextActive,
                ]}>
                {item}
              </Text>
            </TouchableOpacity>
          )}
          contentContainerStyle={styles.filterContent}
        />
      </View>

      {/* History List */}
      {filteredSamples.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📊</Text>
          <Text style={styles.emptyTitle}>No Test Records Found</Text>
          <Text style={styles.emptySubtitle}>
            Run a speed test or start continuous monitoring to populate history.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredSamples}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* Actions footer */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.exportBtn, samples.length === 0 && styles.btnDisabled]}
          onPress={handleExportPrompt}
          disabled={samples.length === 0}>
          <Text style={styles.exportBtnText}>📤 Export CSV/JSON</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.clearBtn, samples.length === 0 && styles.btnDisabled]}
          onPress={handleClearHistory}
          disabled={samples.length === 0}>
          <Text style={styles.clearBtnText}>🗑 Clear Log</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh}>
          <Text style={styles.refreshBtnText}>🔄 Refresh</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F19',
  },
  capacityWarningCard: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: '#F59E0B',
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 8,
    padding: 10,
  },
  warningHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  warningTitle: {
    color: '#F59E0B',
    fontSize: 12,
    fontWeight: '800',
  },
  warningExportBtn: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
  },
  warningExportBtnText: {
    color: '#0F172A',
    fontSize: 11,
    fontWeight: '800',
  },
  warningDesc: {
    color: '#E2E8F0',
    fontSize: 11,
    lineHeight: 15,
  },
  storageStatusStrip: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 2,
  },
  storageStatusText: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '600',
  },
  storageStatusHighlight: {
    color: '#38BDF8',
    fontWeight: '700',
  },
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: '#131B2E',
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 8,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  summaryItem: {
    alignItems: 'center',
    flex: 1,
  },
  summaryLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#F8FAFC',
    marginTop: 3,
  },
  summaryDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#1E293B',
  },
  controlSection: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  displayLimitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#131B2E',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  controlLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
  },
  controlCounter: {
    color: '#38BDF8',
    fontWeight: '600',
  },
  limitPillsContainer: {
    flexDirection: 'row',
    gap: 4,
  },
  limitPill: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  limitPillActive: {
    backgroundColor: '#38BDF8',
    borderColor: '#38BDF8',
  },
  limitPillText: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '700',
  },
  limitPillTextActive: {
    color: '#0F172A',
  },
  filterBar: {
    marginBottom: 8,
  },
  filterContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  filterChipActive: {
    backgroundColor: '#06B6D4',
    borderColor: '#06B6D4',
  },
  filterChipText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
  },
  filterChipTextActive: {
    color: '#0F172A',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#131B2E',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  carrierBadge: {
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  carrierBadgeText: {
    color: '#06B6D4',
    fontSize: 11,
    fontWeight: '800',
  },
  radioBadge: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  radioBadgeText: {
    color: '#A78BFA',
    fontSize: 10,
    fontWeight: '800',
  },
  envBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  envBadgeText: {
    color: '#10B981',
    fontSize: 10,
    fontWeight: '700',
  },
  timeText: {
    color: '#94A3B8',
    fontSize: 11,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  metricItem: {
    flex: 1,
  },
  metricLabel: {
    fontSize: 9,
    color: '#64748B',
    fontWeight: '700',
    marginBottom: 2,
  },
  metricVal: {
    fontSize: 15,
    fontWeight: '800',
  },
  metricUnit: {
    fontSize: 10,
    fontWeight: '400',
    color: '#94A3B8',
  },
  locationFooter: {
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    paddingTop: 8,
    marginTop: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  coordsText: {
    fontSize: 11,
    color: '#94A3B8',
    fontFamily: 'Courier',
  },
  deviceText: {
    fontSize: 11,
    color: '#64748B',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptySubtitle: {
    color: '#64748B',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#0B0F19',
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    gap: 8,
  },
  exportBtn: {
    flex: 1.2,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  exportBtnText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '800',
  },
  clearBtn: {
    flex: 0.9,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearBtnText: {
    color: '#EF4444',
    fontSize: 11,
    fontWeight: '700',
  },
  refreshBtn: {
    flex: 0.9,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshBtnText: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.4,
  },
});
