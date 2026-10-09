import React, { useState, useEffect, useCallback } from 'react';
import {
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
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
import {
  BoltBadgeIcon,
  CloudCheckIcon,
  CloudUploadIcon,
  LightningIcon,
  MapNavIcon,
  HistoryNavIcon,
  SettingsNavIcon,
} from './src/components/Icons';

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
    if (cfg.maxHistoryLimit) {
      sampleStore.setMaxHistoryLimit(cfg.maxHistoryLimit);
    }
    const history = await sampleStore.getHistory(0);
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
        sampleStore.getHistory(0).then(setSamplesHistory);
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
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />

        {/* Top Header Bar (Matching EXACT Theme Mockup) */}
        <View style={styles.topBar}>
          <View style={styles.brandContainer}>
            <View style={styles.logoIcon}>
              <BoltBadgeIcon size={20} color="#F59E0B" />
            </View>
            <View>
              <Text style={styles.appTitle}>TRAI Speed Monitor</Text>
              <View style={styles.statusIndicatorRow}>
                <View
                  style={[
                    styles.statusDot,
                    status.isRunning ? styles.statusDotActive : styles.statusDotIdle,
                  ]}
                />
                <Text style={styles.statusSubtitle}>
                  {status.isRunning ? 'Monitoring Active' : 'Monitoring Idle'}
                </Text>
              </View>
            </View>
          </View>

          {/* Sync Pill (☁ All Synced / X Pending) */}
          <TouchableOpacity
            style={[
              styles.syncPill,
              status.pendingCount > 0 ? styles.syncPillPending : styles.syncPillSynced,
            ]}
            onPress={handleSyncPending}
            disabled={isSyncing}
            activeOpacity={0.8}>
            {isSyncing ? (
              <ActivityIndicator size="small" color="#00A389" />
            ) : status.pendingCount > 0 ? (
              <>
                <CloudUploadIcon size={14} color="#D97706" />
                <Text style={styles.syncPillPendingText}>{status.pendingCount} Pending</Text>
              </>
            ) : (
              <>
                <CloudCheckIcon size={14} color="#00A389" />
                <Text style={styles.syncPillSyncedText}>All Synced</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Main Screen Content */}
        <View style={styles.tabContentContainer}>
          {currentTab === 'SPEED' && (
            <SpeedDashboardView
              config={config}
              status={status}
              refreshing={refreshing}
              onRefresh={onRefresh}
              onToggleMonitoring={handleToggleMonitoring}
              onTestNow={handleTestNow}
            />
          )}

          {currentTab === 'MAP' && (
            <CoverageMapView
              samples={samplesHistory}
              currentLocation={currentLoc}
              onRefresh={loadData}
              onNavigateHistory={() => setCurrentTab('HISTORY')}
            />
          )}

          {currentTab === 'HISTORY' && (
            <HistoryView
              samples={samplesHistory}
              onRefresh={loadData}
              onNavigateTab={tab => setCurrentTab(tab)}
            />
          )}

          {currentTab === 'SETTINGS' && (
            <SettingsView
              onConfigChanged={cfg => setConfig(cfg)}
            />
          )}
        </View>

        {/* Bottom Navigation Bar (Matching Mockup with Speed, Map, History, Settings) */}
        <View style={styles.bottomNav}>
          <TouchableOpacity
            style={styles.navItem}
            onPress={() => setCurrentTab('SPEED')}
            activeOpacity={0.7}>
            <LightningIcon
              size={22}
              color={currentTab === 'SPEED' ? '#00A389' : '#94A3B8'}
            />
            <Text
              style={[
                styles.navLabel,
                currentTab === 'SPEED' && styles.navLabelActive,
              ]}>
              Speed
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navItem}
            onPress={() => {
              setCurrentTab('MAP');
              loadData();
            }}
            activeOpacity={0.7}>
            <MapNavIcon
              size={22}
              color={currentTab === 'MAP' ? '#00A389' : '#94A3B8'}
            />
            <Text
              style={[
                styles.navLabel,
                currentTab === 'MAP' && styles.navLabelActive,
              ]}>
              Map
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navItem}
            onPress={() => {
              setCurrentTab('HISTORY');
              loadData();
            }}
            activeOpacity={0.7}>
            <HistoryNavIcon
              size={22}
              color={currentTab === 'HISTORY' ? '#00A389' : '#94A3B8'}
            />
            <Text
              style={[
                styles.navLabel,
                currentTab === 'HISTORY' && styles.navLabelActive,
              ]}>
              History
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navItem}
            onPress={() => setCurrentTab('SETTINGS')}
            activeOpacity={0.7}>
            <SettingsNavIcon
              size={22}
              color={currentTab === 'SETTINGS' ? '#00A389' : '#94A3B8'}
            />
            <Text
              style={[
                styles.navLabel,
                currentTab === 'SETTINGS' && styles.navLabelActive,
              ]}>
              Settings
            </Text>
          </TouchableOpacity>
        </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F4F6FA',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: '#F4F6FA',
  },
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  logoIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  appTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  statusIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  statusDotActive: {
    backgroundColor: '#10B981',
  },
  statusDotIdle: {
    backgroundColor: '#10B981',
  },
  statusSubtitle: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  syncPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    gap: 5,
  },
  syncPillSynced: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  syncPillPending: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  syncPillSyncedText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#00A389',
  },
  syncPillPendingText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#D97706',
  },
  tabContentContainer: {
    flex: 1,
  },
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E8EDF2',
    paddingTop: 8,
    paddingBottom: 6,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
    paddingHorizontal: 16,
  },
  navLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#94A3B8',
    marginTop: 4,
  },
  navLabelActive: {
    color: '#00A389',
    fontWeight: '700',
  },
});
