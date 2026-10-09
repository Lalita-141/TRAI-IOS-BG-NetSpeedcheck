import React, { useState, useEffect } from 'react';
import {
  Modal,
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

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
  onConfigChanged: (config: AppConfig) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  visible,
  onClose,
  onConfigChanged,
}) => {
  const [serverUrl, setServerUrl] = useState('');
  const [intervalSec, setIntervalSec] = useState(300);
  const [downloadMB, setDownloadMB] = useState(2);
  const [uploadMB, setUploadMB] = useState(1);
  const [wifiOnly, setWifiOnly] = useState(false);
  const [deviceId, setDeviceId] = useState('');

  useEffect(() => {
    if (visible) {
      load();
    }
  }, [visible]);

  const load = async () => {
    const config = await getConfig();
    const id = await getDeviceId();
    setServerUrl(config.serverUrl);
    setIntervalSec(config.testIntervalSeconds);
    setDownloadMB(config.downloadMB);
    setUploadMB(config.uploadMB);
    setWifiOnly(config.wifiOnly);
    setDeviceId(id);
  };

  const handleSave = async () => {
    if (!serverUrl.trim().startsWith('http://') && !serverUrl.trim().startsWith('https://')) {
      Alert.alert('Invalid URL', 'Server URL must start with http:// or https://');
      return;
    }

    const updated = await saveConfig({
      serverUrl: serverUrl.trim(),
      testIntervalSeconds: intervalSec,
      downloadMB,
      uploadMB,
      wifiOnly,
    });

    onConfigChanged(updated);
    onClose();
  };

  const handleClearData = () => {
    Alert.alert(
      'Clear All Local Data',
      'Are you sure you want to clear all queued samples and history?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await sampleStore.clearAll();
            Alert.alert('Success', 'Local queue and history cleared');
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

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Configuration</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {/* Server URL */}
            <View style={styles.section}>
              <Text style={styles.label}>Server Ingest Endpoint</Text>
              <TextInput
                style={styles.input}
                value={serverUrl}
                onChangeText={setServerUrl}
                placeholder="https://140-245-3-81.sslip.io"
                placeholderTextColor="#94A3B8"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {/* Interval */}
            <View style={styles.section}>
              <Text style={styles.label}>Test Interval</Text>
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

            {/* Download Size */}
            <View style={styles.section}>
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
            </View>

            {/* Upload Size */}
            <View style={styles.section}>
              <Text style={styles.label}>Upload Test Size (MB)</Text>
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

            {/* Wi-Fi Only */}
            <View style={styles.switchRow}>
              <View>
                <Text style={styles.switchTitle}>Wi-Fi Only Mode</Text>
                <Text style={styles.helperText}>Skips cellular mobile data</Text>
              </View>
              <Switch
                value={wifiOnly}
                onValueChange={setWifiOnly}
                trackColor={{ false: '#E2E8F0', true: '#00A389' }}
                thumbColor="#FFFFFF"
              />
            </View>

            {/* Device ID */}
            <View style={styles.section}>
              <Text style={styles.label}>Device UUID</Text>
              <Text style={styles.deviceIdText}>{deviceId || 'Loading...'}</Text>
            </View>

            {/* Reset */}
            <TouchableOpacity style={styles.clearBtn} onPress={handleClearData}>
              <Text style={styles.clearBtnText}>Clear Local Queue & History</Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Footer Save */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveBtnText}>Save Configuration</Text>
            </TouchableOpacity>
          </View>
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
    maxHeight: '90%',
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
  body: {
    paddingHorizontal: 16,
  },
  bodyContent: {
    paddingVertical: 14,
  },
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E8EDF2',
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  helperText: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#0F172A',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  buttonGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  groupBtn: {
    flex: 1,
    minWidth: '22%',
    backgroundColor: '#F8FAFC',
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
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
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E8EDF2',
  },
  switchTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  deviceIdText: {
    color: '#64748B',
    fontFamily: 'Courier',
    fontSize: 12,
    backgroundColor: '#F8FAFC',
    padding: 8,
    borderRadius: 6,
  },
  clearBtn: {
    marginTop: 6,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
  },
  clearBtnText: {
    color: '#EF4444',
    fontWeight: '600',
    fontSize: 12,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  saveBtn: {
    backgroundColor: '#00A389',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
});
