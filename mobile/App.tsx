import React, { useState, useEffect, useCallback } from 'react';
import {
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppConfig, Sample } from './src/types';
import { getConfig } from './src/config';
import { monitorService, MonitorStatus } from './src/services/monitorService';
import { uploader } from './src/services/uploader';
import { sampleStore } from './src/services/sampleStore';
import { locationService } from './src/services/locationService';

import { SpeedDashboardView } from './src/components/SpeedDashboardView';
import { CoverageMapView } from './src/components/CoverageMapView';
import { HistoryView } from './src/components/HistoryView';
import { SettingsView } from './src/components/SettingsView';

type TabType = 'SPEED' | 'MAP' | 'HISTORY' | 'SETTINGS';

export default function App() {
  const [currentTab, setCurrentTab] = useState<TabType>('SPEED');
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [samplesHistory, setSamplesHistory] = useState<Sample[]>([]);
  const [currentLoc, setCurrentLoc] = useState<{ lat: number | null; lng: number | null } | null>(null);
  const [status, setStatus] = useState<MonitorStatus>({
    isRunning: false,
    isTesting: false,
    lastTestTime: null,
    lastSample: null,
    pendingCount: 0,
  });
  const [refreshing, setRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const loadData = useCallback(async () => {
    const cfg = await getConfig();
    setConfig(cfg);
    const history = await sampleStore.getHistory(100);
    setSamplesHistory(history);
    const pending = await sampleStore.getPendingCount();
    setStatus(prev => ({
      ...prev,
      pendingCount: pending,
      lastSample: history.length > 0 ? history[0] : prev.lastSample,
    }));
  }, []);

  useEffect(() => {
    loadData();

    // Acquire current GPS location for Map centering
    locationService.getCurrentLocation().then(loc => {
      if (loc.lat && loc.lng) {
        setCurrentLoc({ lat: loc.lat, lng: loc.lng });
      }
    });

    // Subscribe to monitor service updates
    const unsubscribe = monitorService.subscribe(newStatus => {
      setStatus(newStatus);
      if (newStatus.lastSample) {
        sampleStore.getHistory(100).then(setSamplesHistory);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadData();
    } finally {
      setRefreshing(false);
    }
  }, [loadData]);

  const handleToggleMonitoring = async () => {
    if (status.isRunning) {
      monitorService.stop();
    } else {
      await monitorService.start();
    }
  };

  const handleTestNow = async () => {
    if (status.isTesting) return;
    await monitorService.testNow();
    await loadData();
  };

  const handleSyncPending = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const res = await uploader.flush();
      if (res.success) {
        Alert.alert('Sync Successful', `Uploaded ${res.uploadedCount} samples to server.`);
      } else {
        Alert.alert('Sync Incomplete', res.error || 'Server unreachable.');
      }
      await loadData();
    } catch (e: any) {
      Alert.alert('Sync Failed', e?.message || 'Network error');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar barStyle="light-content" />

      {/* Top Header Bar */}
      <View style={styles.topBar}>
        <View style={styles.brandContainer}>
          <View style={styles.logoIcon}>
            <Text style={styles.logoText}>⚡</Text>
          </View>
          <View>
            <Text style={styles.appTitle}>TRAI SPEED MONITOR</Text>
            <Text style={styles.serverSubtitle} numberOfLines={1}>
              {config?.serverUrl || 'http://172.20.10.10:8000'}
            </Text>
          </View>
        </View>

        {/* Quick Sync / Status Header Pill */}
        <TouchableOpacity
          style={[
            styles.statusPill,
            status.isRunning ? styles.statusPillActive : styles.statusPillIdle,
          ]}
          onPress={handleToggleMonitoring}>
          <View
            style={[
              styles.statusPillDot,
              { backgroundColor: status.isRunning ? '#10B981' : '#64748B' },
            ]}
          />
          <Text style={styles.statusPillText}>
            {status.isRunning ? 'AUTO ON' : 'AUTO OFF'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Main Tab Screen Content */}
      <View style={styles.tabContentContainer}>
        {currentTab === 'SPEED' && (
          <SpeedDashboardView
            config={config}
            status={status}
            refreshing={refreshing}
            isSyncing={isSyncing}
            onRefresh={onRefresh}
            onToggleMonitoring={handleToggleMonitoring}
            onTestNow={handleTestNow}
            onSyncPending={handleSyncPending}
          />
        )}

        {currentTab === 'MAP' && (
          <CoverageMapView
            samples={samplesHistory}
            currentLocation={currentLoc}
            onRefresh={loadData}
          />
        )}

        {currentTab === 'HISTORY' && (
          <HistoryView
            samples={samplesHistory}
            onRefresh={loadData}
          />
        )}

        {currentTab === 'SETTINGS' && (
          <SettingsView
            onConfigChanged={cfg => setConfig(cfg)}
          />
        )}
      </View>

      {/* TRAI Style Bottom Navigation Bar */}
      <View style={styles.bottomNav}>
        <TouchableOpacity
          style={[styles.navItem, currentTab === 'SPEED' && styles.navItemActive]}
          onPress={() => setCurrentTab('SPEED')}>
          <Text style={styles.navIcon}>⚡</Text>
          <Text style={[styles.navLabel, currentTab === 'SPEED' && styles.navLabelActive]}>
            SPEED
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navItem, currentTab === 'MAP' && styles.navItemActive]}
          onPress={() => {
            setCurrentTab('MAP');
            loadData();
          }}>
          <Text style={styles.navIcon}>🗺️</Text>
          <Text style={[styles.navLabel, currentTab === 'MAP' && styles.navLabelActive]}>
            MAP
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navItem, currentTab === 'HISTORY' && styles.navItemActive]}
          onPress={() => {
            setCurrentTab('HISTORY');
            loadData();
          }}>
          <Text style={styles.navIcon}>📊</Text>
          <Text style={[styles.navLabel, currentTab === 'HISTORY' && styles.navLabelActive]}>
            HISTORY
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navItem, currentTab === 'SETTINGS' && styles.navItemActive]}
          onPress={() => setCurrentTab('SETTINGS')}>
          <Text style={styles.navIcon}>⚙️</Text>
          <Text style={[styles.navLabel, currentTab === 'SETTINGS' && styles.navLabelActive]}>
            SETTINGS
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0B0F19',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  logoIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    borderWidth: 1,
    borderColor: '#06B6D4',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  logoText: {
    fontSize: 18,
  },
  appTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: 1,
  },
  serverSubtitle: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
    maxWidth: 170,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
  },
  statusPillActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: '#10B981',
  },
  statusPillIdle: {
    backgroundColor: '#1E293B',
    borderColor: '#334155',
  },
  statusPillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: 0.5,
  },
  tabContentContainer: {
    flex: 1,
  },
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: '#131B2E',
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    paddingVertical: 6,
    paddingBottom: 8,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  navItemActive: {
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
  },
  navIcon: {
    fontSize: 20,
    marginBottom: 2,
  },
  navLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.6,
  },
  navLabelActive: {
    color: '#06B6D4',
    fontWeight: '800',
  },
});
