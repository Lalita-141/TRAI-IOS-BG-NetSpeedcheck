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
  Linking,
  ActivityIndicator,
} from 'react-native';
import { AppConfig } from '../types';
import { getConfig, saveConfig, getDeviceId } from '../config';
import { sampleStore } from '../services/sampleStore';
import { uploader } from '../services/uploader';
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
  const [isDeletingServerData, setIsDeletingServerData] = useState(false);

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

  const handleEmailDeletionRequest = () => {
    const email = 'privacy@hareandturtle.ai';
    const subject = encodeURIComponent('Data Deletion Request - NetSpeed QoS Monitor');
    const body = encodeURIComponent(
      `Hello Privacy Team,\n\nIn accordance with NetSpeed QoS Monitor data retention and deletion policies, I request the deletion of all server-side measurement records associated with my device:\n\nDevice UUID: ${deviceId}\n\nThank you.`
    );
    const mailtoUrl = `mailto:${email}?subject=${subject}&body=${body}`;

    Linking.canOpenURL(mailtoUrl)
      .then(supported => {
        if (supported) {
          Linking.openURL(mailtoUrl);
        } else {
          Alert.alert(
            'Data Deletion Request',
            `Please email privacy@hareandturtle.ai with your Device UUID:\n\n${deviceId}\n\nWe will process your deletion request promptly.`,
            [{ text: 'OK' }]
          );
        }
      })
      .catch(() => {
        Alert.alert(
          'Data Deletion Request',
          `Please email privacy@hareandturtle.ai with your Device UUID:\n\n${deviceId}`,
          [{ text: 'OK' }]
        );
      });
  };

  const handleServerDataDeletion = () => {
    Alert.alert(
      'Delete Backend Records',
      `Permanently delete all server-side measurement records for Device UUID:\n\n${deviceId}?\n\nRecords older than 90 days are already automatically deleted. This action will immediately purge any remaining active records.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: '🗑 Delete From Server',
          style: 'destructive',
          onPress: async () => {
            setIsDeletingServerData(true);
            try {
              const res = await uploader.deleteServerRecordsForDevice(deviceId);
              if (res.success) {
                Alert.alert(
                  'Server Deletion Complete',
                  `Successfully deleted ${res.count ?? 0} server record(s) for this device.`
                );
              } else {
                Alert.alert(
                  'Deletion Notice',
                  `${res.error || 'Unable to connect to server'}.\n\nYou can also submit a verified deletion request to privacy@hareandturtle.ai.`
                );
              }
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Server deletion request failed.');
            } finally {
              setIsDeletingServerData(false);
            }
          },
        },
      ]
    );
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
    { label: '30s', value: 30 },
    { label: '1m', value: 60 },
    { label: '5m', value: 300 },
    { label: '15m', value: 900 },
    { label: '30m', value: 1800 },
  ];

  const payloadOptions = [1, 2, 5, 10];
  const historyLimitOptions = [100, 250, 500, 1000, 2500, 5000];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}>
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
          placeholderTextColor="#94A3B8"
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
        <Text style={styles.sectionTitle}>Local Storage & Rotation</Text>
        <Text style={styles.label}>Max Local Log Capacity</Text>
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
          Currently holding {sampleCount} records locally. Auto-rotates when capacity is reached.
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

        <Text style={[styles.label, styles.marginTopLabel]}>Upload Test Size (MB)</Text>
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
          trackColor={{ false: '#E2E8F0', true: '#00A389' }}
          thumbColor="#FFFFFF"
        />
      </View>

      {/* Export & Data Management */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Data Export & Backup</Text>
        <Text style={styles.helperText}>Export all local speed test logs for spreadsheet analysis:</Text>
        <View style={styles.exportBtnRow}>
          <TouchableOpacity style={styles.exportActionBtn} onPress={handleExportCSV}>
            <Text style={styles.exportActionBtnText}>📊 Export as CSV</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.exportActionBtn} onPress={handleExportJSON}>
            <Text style={styles.exportActionBtnText}>📄 Export as JSON</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Data Retention and Deletion (Apple Compliance) */}
      <View style={styles.section}>
        <View style={styles.retentionHeaderRow}>
          <Text style={styles.sectionTitle}>Data Retention & Deletion</Text>
          <View style={styles.retentionBadge}>
            <Text style={styles.retentionBadgeText}>90 Days Backend Retention</Text>
          </View>
        </View>

        <View style={styles.retentionCard}>
          <Text style={styles.retentionHeading}>Backend Retention Period</Text>
          <Text style={styles.retentionBody}>
            NetSpeed QoS Monitor retains network measurement records on its backend for up to <Text style={styles.boldText}>90 days</Text> from the date they are recorded. Records older than this period are automatically deleted through our data-retention process.
          </Text>

          <Text style={[styles.retentionHeading, styles.marginTopSmall]}>User Deletion Requests</Text>
          <Text style={styles.retentionBody}>
            Users may request deletion of their measurement records by contacting <Text style={styles.linkText} onPress={handleEmailDeletionRequest}>privacy@hareandturtle.ai</Text>. We will process verified requests in accordance with applicable law.
          </Text>

          <View style={styles.noticeBox}>
            <Text style={styles.noticeBoxText}>
              ⚠️ <Text style={styles.boldText}>Important Notice:</Text> Deleting the App does not automatically delete records already transmitted to our backend. Users may contact us to request deletion of server-side records. Backup copies, where applicable, are managed according to our backup-retention procedures and applicable legal requirements.
            </Text>
          </View>
        </View>

        {/* Action Buttons for Apple Compliance */}
        <View style={styles.retentionActionRow}>
          <TouchableOpacity
            style={styles.retentionActionBtn}
            onPress={handleEmailDeletionRequest}
            activeOpacity={0.8}>
            <Text style={styles.retentionActionBtnText}>✉️ Email Deletion Request</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.retentionActionBtn, styles.retentionWipeBtn]}
            onPress={handleServerDataDeletion}
            disabled={isDeletingServerData}
            activeOpacity={0.8}>
            {isDeletingServerData ? (
              <ActivityIndicator size="small" color="#DC2626" />
            ) : (
              <Text style={styles.retentionWipeBtnText}>🗑 Wipe Server Records</Text>
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.privacyPolicyBtn}
          onPress={() => Linking.openURL('https://hareandturtle.ai/privacy-policy.html')}
          activeOpacity={0.8}>
          <Text style={styles.privacyPolicyBtnText}>🔒 View Company Privacy Policy</Text>
        </TouchableOpacity>
      </View>

      {/* Device Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Device Telemetry</Text>
        <Text style={styles.label}>Unique Device UUID</Text>
        <Text style={styles.deviceIdText}>{deviceId || 'Loading...'}</Text>
      </View>

      {/* Save Button */}
      <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.85}>
        <Text style={styles.saveBtnText}>Save Configuration</Text>
      </TouchableOpacity>

      {/* Clear Data */}
      <TouchableOpacity style={styles.clearBtn} onPress={handleClearData} activeOpacity={0.85}>
        <Text style={styles.clearBtnText}>Wipe Local Samples & History</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F6FA',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  successBanner: {
    backgroundColor: '#ECFDF5',
    borderColor: '#00A389',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    alignItems: 'center',
  },
  successBannerText: {
    color: '#00A389',
    fontWeight: '700',
    fontSize: 13,
  },
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E8EDF2',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 10,
    letterSpacing: -0.2,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  marginTopLabel: {
    marginTop: 12,
  },
  helperText: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 5,
    lineHeight: 15,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#0F172A',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  presetRow: {
    flexDirection: 'row',
    marginTop: 8,
  },
  presetBtn: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  presetBtnText: {
    color: '#00A389',
    fontSize: 11,
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
    backgroundColor: '#F8FAFC',
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  groupBtnActive: {
    backgroundColor: '#00A389',
    borderColor: '#00A389',
  },
  groupBtnText: {
    color: '#64748B',
    fontWeight: '600',
    fontSize: 12,
  },
  groupBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  exportBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  exportActionBtn: {
    flex: 1,
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  exportActionBtnText: {
    color: '#0284C7',
    fontWeight: '700',
    fontSize: 12,
  },
  privacyPolicyBtn: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  privacyPolicyBtnText: {
    color: '#16A34A',
    fontWeight: '700',
    fontSize: 12,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E8EDF2',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  switchTextContainer: {
    flex: 1,
  },
  switchTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  deviceIdText: {
    color: '#64748B',
    fontFamily: 'Courier',
    fontSize: 12,
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  saveBtn: {
    backgroundColor: '#00A389',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 10,
    shadowColor: '#00A389',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: 0.5,
  },
  clearBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
  },
  clearBtnText: {
    color: '#EF4444',
    fontWeight: '600',
    fontSize: 12,
  },
  retentionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  retentionBadge: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  retentionBadgeText: {
    color: '#00A389',
    fontWeight: '700',
    fontSize: 11,
  },
  retentionCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 12,
  },
  retentionHeading: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 4,
  },
  retentionBody: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 17,
  },
  boldText: {
    fontWeight: '700',
    color: '#0F172A',
  },
  linkText: {
    color: '#00A389',
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  marginTopSmall: {
    marginTop: 10,
  },
  noticeBox: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
  },
  noticeBoxText: {
    fontSize: 11,
    color: '#92400E',
    lineHeight: 16,
  },
  retentionActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  retentionActionBtn: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retentionActionBtnText: {
    color: '#334155',
    fontWeight: '600',
    fontSize: 11,
    textAlign: 'center',
  },
  retentionWipeBtn: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  retentionWipeBtnText: {
    color: '#DC2626',
    fontWeight: '700',
    fontSize: 11,
    textAlign: 'center',
  },
});
