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
import {
  DownloadIcon,
  UploadIcon,
  ClockIcon,
  WaveformIcon,
} from './Icons';

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
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderItem = ({ item }: { item: Sample }) => {
    const carrier =
      item.carrier && item.carrier !== '--' && item.carrier !== 'wifi'
        ? item.carrier
        : item.network === 'wifi'
        ? 'Wi-Fi'
        : item.radio || 'Cellular';

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.networkBadge}>
            <Text style={styles.networkText}>
              {carrier} • {item.network === 'wifi' ? 'Wi-Fi' : item.radio || 'Cell'}
            </Text>
          </View>
          <Text style={styles.timeText}>{formatDate(item.ts)}</Text>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCol}>
            <DownloadIcon size={12} color="#0284C7" />
            <Text style={styles.statValue}>
              {item.down_mbps != null ? `${item.down_mbps.toFixed(1)}` : '--'}
            </Text>
            <Text style={styles.statUnit}>Mbps</Text>
          </View>

          <View style={styles.statCol}>
            <UploadIcon size={12} color="#7C3AED" />
            <Text style={styles.statValue}>
              {item.up_mbps != null ? `${item.up_mbps.toFixed(1)}` : '--'}
            </Text>
            <Text style={styles.statUnit}>Mbps</Text>
          </View>

          <View style={styles.statCol}>
            <ClockIcon size={12} color="#D97706" />
            <Text style={styles.statValue}>
              {item.latency_ms != null ? `${Math.round(item.latency_ms)}` : '--'}
            </Text>
            <Text style={styles.statUnit}>ms</Text>
          </View>

          {item.jitter_ms != null ? (
            <View style={styles.statCol}>
              <WaveformIcon size={12} color="#DB2777" />
              <Text style={styles.statValue}>
                {item.jitter_ms.toFixed(1)}
              </Text>
              <Text style={styles.statUnit}>ms</Text>
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
              <Text style={styles.emptyText}>No test records available</Text>
              <Text style={styles.emptySubtext}>Run a speed test to record metrics</Text>
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
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#F4F6FA',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '80%',
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#E8EDF2',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  closeBtn: {
    padding: 6,
  },
  closeBtnText: {
    color: '#64748B',
    fontSize: 18,
    fontWeight: '700',
  },
  listContent: {
    padding: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E8EDF2',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  networkBadge: {
    backgroundColor: '#CCFBF1',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  networkText: {
    color: '#0F766E',
    fontSize: 11,
    fontWeight: '700',
  },
  timeText: {
    color: '#64748B',
    fontSize: 12,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  statValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  statUnit: {
    fontSize: 10,
    color: '#64748B',
  },
  locationRow: {
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 6,
    marginTop: 6,
  },
  locationText: {
    fontSize: 11,
    color: '#64748B',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  emptyText: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  emptySubtext: {
    color: '#64748B',
    fontSize: 12,
  },
});
