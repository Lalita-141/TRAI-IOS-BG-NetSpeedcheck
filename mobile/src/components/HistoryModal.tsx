import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Sample } from '../types';
import { sampleStore } from '../services/sampleStore';

interface HistoryModalProps {
  visible: boolean;
  onClose: () => void;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({ visible, onClose }) => {
  const [samples, setSamples] = useState<Sample[]>([]);

  useEffect(() => {
    if (visible) {
      loadHistory();
    }
  }, [visible]);

  const loadHistory = async () => {
    const list = await sampleStore.getHistory(0);
    setSamples(list);
  };

  const formatDate = (epochSec: number) => {
    const d = new Date(epochSec * 1000);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const renderItem = ({ item }: { item: Sample }) => {
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.networkBadge}>
            <Text style={styles.networkText}>
              {item.carrier ? `${item.carrier} • ` : ''}
              {item.network?.toUpperCase() || 'NET'} {item.radio ? `(${item.radio})` : ''}
            </Text>
          </View>
          <Text style={styles.timeText}>{formatDate(item.ts)}</Text>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCol}>
            <Text style={styles.statLabel}>DOWNLOAD</Text>
            <Text style={styles.statValue}>
              {item.down_mbps != null ? `${item.down_mbps.toFixed(1)}` : '--'}
              <Text style={styles.statUnit}> Mbps</Text>
            </Text>
          </View>

          <View style={styles.statCol}>
            <Text style={styles.statLabel}>UPLOAD</Text>
            <Text style={styles.statValue}>
              {item.up_mbps != null ? `${item.up_mbps.toFixed(1)}` : '--'}
              <Text style={styles.statUnit}> Mbps</Text>
            </Text>
          </View>

          <View style={styles.statCol}>
            <Text style={styles.statLabel}>LATENCY</Text>
            <Text style={styles.statValue}>
              {item.latency_ms != null ? `${Math.round(item.latency_ms)}` : '--'}
              <Text style={styles.statUnit}> ms</Text>
            </Text>
          </View>

          {item.jitter_ms != null ? (
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>JITTER</Text>
              <Text style={styles.statValue}>
                {item.jitter_ms.toFixed(1)}
                <Text style={styles.statUnit}> ms</Text>
              </Text>
            </View>
          ) : null}
        </View>

        {item.lat != null && item.lng != null ? (
          <View style={styles.locationRow}>
            <Text style={styles.locationText}>
              📍 {item.lat.toFixed(5)}, {item.lng.toFixed(5)}
              {item.accuracy != null ? ` (±${Math.round(item.accuracy)}m)` : ''}
            </Text>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Sample History ({samples.length})</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {samples.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No speed test samples recorded yet</Text>
              <Text style={styles.emptySubtext}>Run a test or start monitoring to record data</Text>
            </View>
          ) : (
            <FlatList
              data={samples}
              keyExtractor={item => item.id}
              renderItem={renderItem}
              contentContainerStyle={styles.listContent}
            />
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '80%',
    paddingBottom: 24,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  closeBtn: {
    padding: 6,
  },
  closeBtnText: {
    color: '#94A3B8',
    fontSize: 18,
    fontWeight: '700',
  },
  listContent: {
    padding: 16,
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  networkBadge: {
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  networkText: {
    color: '#06B6D4',
    fontSize: 11,
    fontWeight: '700',
  },
  timeText: {
    color: '#94A3B8',
    fontSize: 12,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statCol: {
    flex: 1,
  },
  statLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 2,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  statUnit: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '400',
  },
  locationRow: {
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingTop: 6,
    marginTop: 4,
  },
  locationText: {
    fontSize: 11,
    color: '#94A3B8',
    fontFamily: 'Courier',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  emptyText: {
    color: '#94A3B8',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 6,
  },
  emptySubtext: {
    color: '#64748B',
    fontSize: 13,
  },
});
