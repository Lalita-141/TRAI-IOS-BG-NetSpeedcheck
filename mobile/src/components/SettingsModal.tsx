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
    { label: '30s (Test)', value: 30 },
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
                placeholder="http://192.168.1.10:8000"
                placeholderTextColor="#475569"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <View style={styles.presetRow}>
                <TouchableOpacity
                  style={styles.presetBtn}
                  onPress={() => setServerUrl('http://172.20.1.86:8000')}>
                  <Text style={styles.presetBtnText}>172.20.1.86:8000 (Mac LAN)</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.presetBtn}
                  onPress={() => setServerUrl('http://127.0.0.1:8000')}>
                  <Text style={styles.presetBtnText}>localhost</Text>
                </TouchableOpacity>
              </View>
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
                <Text style={styles.label}>Wi-Fi Only Mode</Text>
                <Text style={styles.helperText}>Prevents cellular data usage during tests</Text>
              </View>
              <Switch
                value={wifiOnly}
                onValueChange={setWifiOnly}
                trackColor={{ false: '#334155', true: '#06B6D4' }}
                thumbColor="#FFFFFF"
              />
            </View>

            {/* Device ID */}
            <View style={styles.section}>
              <Text style={styles.label}>Device UUID</Text>
              <Text style={styles.deviceIdText}>{deviceId || 'Loading...'}</Text>
            </View>

            {/* Reset / Data Wipe */}
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
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
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
  body: {
    paddingHorizontal: 20,
  },
  bodyContent: {
    paddingVertical: 14,
  },
  section: {
    marginBottom: 18,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  helperText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
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
    minWidth: '22%',
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
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 12,
    paddingVertical: 8,
  },
  deviceIdText: {
    color: '#64748B',
    fontFamily: 'Courier',
    fontSize: 12,
    backgroundColor: '#1E293B',
    padding: 10,
    borderRadius: 8,
  },
  clearBtn: {
    marginTop: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  clearBtnText: {
    color: '#EF4444',
    fontWeight: '600',
    fontSize: 13,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  saveBtn: {
    backgroundColor: '#06B6D4',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#0F172A',
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: 0.5,
  },
});
