import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Switch,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { AppConfig } from '../types';
import { getConfig, saveConfig, getDeviceId } from '../config';
import { sampleStore } from '../services/sampleStore';
import { exportSamplesAsCSV, exportSamplesAsJSON } from '../utils/exportUtils';

interface SettingsViewProps {
  onConfigChanged: (config: AppConfig) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onConfigChanged }) => {
  const [serverUrl, setServerUrl] = useState('');
  const [intervalSec, setIntervalSec] = useState(300);
  const [downloadMB, setDownloadMB] = useState(2);
  const [uploadMB, setUploadMB] = useState(1);
  const [wifiOnly, setWifiOnly] = useState(false);
  const [maxHistoryLimit, setMaxHistoryLimit] = useState(500);
  const [deviceId, setDeviceId] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [sampleCount, setSampleCount] = useState(0);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    const config = await getConfig();
    const id = await getDeviceId();
    const capacity = await sampleStore.getCapacityInfo();
    setServerUrl(config.serverUrl);
    setIntervalSec(config.testIntervalSeconds);
    setDownloadMB(config.downloadMB);
    setUploadMB(config.uploadMB);
    setWifiOnly(config.wifiOnly);
    setMaxHistoryLimit(config.maxHistoryLimit || 500);
    setDeviceId(id);
    setSampleCount(capacity.count);
  };

  const handleSave = async () => {
    if (!serverUrl.trim().startsWith('http://') && !serverUrl.trim().startsWith('https://')) {
      Alert.alert('Invalid URL', 'Server URL must start with http:// or https://');
      return;
    }

    sampleStore.setMaxHistoryLimit(maxHistoryLimit);

    const updated = await saveConfig({
      serverUrl: serverUrl.trim(),
      testIntervalSeconds: intervalSec,
      downloadMB,
      uploadMB,
      wifiOnly,
      maxHistoryLimit,
    });

    onConfigChanged(updated);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const handleExportCSV = async () => {
    const samples = await sampleStore.getHistory(0);
    await exportSamplesAsCSV(samples);
  };

  const handleExportJSON = async () => {
    const samples = await sampleStore.getHistory(0);
    await exportSamplesAsJSON(samples);
  };

  const handleClearData = async () => {
    const samples = await sampleStore.getHistory(0);
    Alert.alert(
      'Clear All Local Data',
      `You have ${samples.length} test records stored. Would you like to backup/export before clearing?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: '📤 Export & Clear',
          onPress: async () => {
            await exportSamplesAsCSV(samples);
            await sampleStore.clearAll();
            setSampleCount(0);
            Alert.alert('Success', 'Exported and cleared all local logs.');
          },
        },
        {
          text: '🗑 Clear All',
          style: 'destructive',
          onPress: async () => {
            await sampleStore.clearAll();
            setSampleCount(0);
            Alert.alert('Success', 'Local queue and history cleared.');
          },
        },
      ]
    );
  };

  const intervalOptions = [
    { label: '30s (Drive/Test)', value: 30 },
    { label: '1m', value: 60 },
    { label: '5m', value: 300 },
    { label: '15m', value: 900 },
    { label: '30m', value: 1800 },
  ];

  const payloadOptions = [1, 2, 5, 10];
  const historyLimitOptions = [100, 250, 500, 1000, 2500, 5000];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {savedSuccess && (
        <View style={styles.successBanner}>
          <Text style={styles.successBannerText}>✓ Configuration Saved Successfully</Text>
        </View>
      )}

      {/* Server Ingest URL */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Server Configuration</Text>
        <Text style={styles.label}>FastAPI Ingest Endpoint</Text>
        <TextInput
          style={styles.input}
          value={serverUrl}
          onChangeText={setServerUrl}
          placeholder="https://140-245-3-81.sslip.io"
          placeholderTextColor="#475569"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <View style={styles.presetRow}>
          <TouchableOpacity
            style={styles.presetBtn}
            onPress={() => setServerUrl('https://140-245-3-81.sslip.io')}>
            <Text style={styles.presetBtnText}>140-245-3-81.sslip.io (Oracle Cloud)</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Testing Cadence */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Monitoring Cadence</Text>
        <Text style={styles.label}>Automated Background Interval</Text>
        <View style={styles.buttonGroup}>
          {intervalOptions.map(opt => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.groupBtn, intervalSec === opt.value && styles.groupBtnActive]}
              onPress={() => setIntervalSec(opt.value)}>
              <Text
                style={[
                  styles.groupBtnText,
                  intervalSec === opt.value && styles.groupBtnTextActive,
                ]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* History Storage Retention Limit */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>History Storage & Auto-Depletion</Text>
        <Text style={styles.label}>Max Local Log Capacity (Entries)</Text>
        <View style={styles.buttonGroup}>
          {historyLimitOptions.map(limit => (
            <TouchableOpacity
              key={limit}
              style={[styles.groupBtn, maxHistoryLimit === limit && styles.groupBtnActive]}
              onPress={() => setMaxHistoryLimit(limit)}>
              <Text
                style={[
                  styles.groupBtnText,
                  maxHistoryLimit === limit && styles.groupBtnTextActive,
                ]}>
                {limit.toLocaleString()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.helperText}>
          Currently holding {sampleCount} records. Once storage reaches this cap, older entries automatically auto-deplete (rotate out) to prevent memory overload.
        </Text>
      </View>

      {/* Test Payloads */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>QoS Test Parameters</Text>
        <Text style={styles.label}>Download Test Size (MB)</Text>
        <View style={styles.buttonGroup}>
          {payloadOptions.map(mb => (
            <TouchableOpacity
              key={mb}
              style={[styles.groupBtn, downloadMB === mb && styles.groupBtnActive]}
              onPress={() => setDownloadMB(mb)}>
              <Text
                style={[
                  styles.groupBtnText,
                  downloadMB === mb && styles.groupBtnTextActive,
                ]}>
                {mb} MB
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.label, { marginTop: 12 }]}>Upload Test Size (MB)</Text>
        <View style={styles.buttonGroup}>
          {payloadOptions.slice(0, 3).map(mb => (
            <TouchableOpacity
              key={mb}
              style={[styles.groupBtn, uploadMB === mb && styles.groupBtnActive]}
              onPress={() => setUploadMB(mb)}>
              <Text
                style={[
                  styles.groupBtnText,
                  uploadMB === mb && styles.groupBtnTextActive,
                ]}>
                {mb} MB
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Wi-Fi Only Switch */}
      <View style={styles.switchRow}>
        <View style={styles.switchTextContainer}>
          <Text style={styles.switchTitle}>Wi-Fi Only Mode</Text>
          <Text style={styles.helperText}>Skips tests when on cellular mobile data</Text>
        </View>
        <Switch
          value={wifiOnly}
          onValueChange={setWifiOnly}
          trackColor={{ false: '#334155', true: '#06B6D4' }}
          thumbColor="#FFFFFF"
        />
      </View>

      {/* Export & Data Management */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Data Export & Backup</Text>
        <Text style={styles.helperText}>Export all local speed test logs for external analysis:</Text>
        <View style={styles.exportBtnRow}>
          <TouchableOpacity style={styles.exportActionBtn} onPress={handleExportCSV}>
            <Text style={styles.exportActionBtnText}>📊 Export as CSV</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.exportActionBtn} onPress={handleExportJSON}>
            <Text style={styles.exportActionBtnText}>📄 Export as JSON</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Device Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Device Telemetry</Text>
        <Text style={styles.label}>Unique Device UUID</Text>
        <Text style={styles.deviceIdText}>{deviceId || 'Loading...'}</Text>
      </View>

      {/* Save Button */}
      <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
        <Text style={styles.saveBtnText}>SAVE CONFIGURATION</Text>
      </TouchableOpacity>

      {/* Clear Data */}
      <TouchableOpacity style={styles.clearBtn} onPress={handleClearData}>
        <Text style={styles.clearBtnText}>Wipe Local Samples & History</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F19',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  successBanner: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderColor: '#10B981',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    alignItems: 'center',
  },
  successBannerText: {
    color: '#10B981',
    fontWeight: '700',
    fontSize: 13,
  },
  section: {
    backgroundColor: '#131B2E',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#F8FAFC',
    marginBottom: 10,
    letterSpacing: 0.5,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  helperText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 6,
    lineHeight: 16,
  },
  input: {
    backgroundColor: '#1E293B',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#F8FAFC',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#334155',
  },
  presetRow: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 8,
  },
  presetBtn: {
    backgroundColor: '#1E293B',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  presetBtnText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '600',
  },
  buttonGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  groupBtn: {
    flex: 1,
    minWidth: '28%',
    backgroundColor: '#1E293B',
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  groupBtnActive: {
    backgroundColor: '#06B6D4',
    borderColor: '#06B6D4',
  },
  groupBtnText: {
    color: '#94A3B8',
    fontWeight: '600',
    fontSize: 13,
  },
  groupBtnTextActive: {
    color: '#0F172A',
    fontWeight: '700',
  },
  exportBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  exportActionBtn: {
    flex: 1,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  exportActionBtnText: {
    color: '#38BDF8',
    fontWeight: '700',
    fontSize: 12,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#131B2E',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  switchTextContainer: {
    flex: 1,
  },
  switchTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  deviceIdText: {
    color: '#64748B',
    fontFamily: 'Courier',
    fontSize: 12,
    backgroundColor: '#1E293B',
    padding: 10,
    borderRadius: 8,
  },
  saveBtn: {
    backgroundColor: '#06B6D4',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#06B6D4',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveBtnText: {
    color: '#0F172A',
    fontWeight: '800',
    fontSize: 15,
    letterSpacing: 1,
  },
  clearBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  clearBtnText: {
    color: '#EF4444',
    fontWeight: '700',
    fontSize: 13,
  },
});
