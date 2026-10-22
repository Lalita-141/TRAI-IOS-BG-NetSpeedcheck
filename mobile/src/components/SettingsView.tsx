import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Switch,
  ScrollView,
  StyleSheet,
  Alert,
  Linking,
  ActivityIndicator,
  Share,
  Modal,
  TextInput,
  Platform,
} from 'react-native';
import { AppConfig } from '../types';
import { getConfig, saveConfig, getDeviceId } from '../config';
import { sampleStore } from '../services/sampleStore';
import { uploader } from '../services/uploader';
import { exportSamplesAsCSV, exportSamplesAsJSON } from '../utils/exportUtils';
import {
  LanguageIcon,
  DataUsageIcon,
  FaqIcon,
  TutorialVideoIcon,
  InfoCircleIcon,
  ShareAppIcon,
  StarFeedbackIcon,
  RateStoreIcon,
  ExportTrayIcon,
  TagLabelIcon,
  LockPrivacyIcon,
  ChevronRightIcon,
  CloseIcon,
  CheckCircleIcon,
  CloudUploadIcon,
} from './Icons';
import { useTranslation, SUPPORTED_LANGUAGES, SupportedLanguage } from '../i18n';

interface SettingsViewProps {
  onConfigChanged: (config: AppConfig) => void;
}

type ActiveModal =
  | 'language'
  | 'data_usage'
  | 'faq'
  | 'tutorial'
  | 'about'
  | 'feedback'
  | 'label'
  | 'privacy'
  | null;

const AVAILABLE_LABELS = [
  { id: 'Outdoor', label: 'Outdoor', icon: '🌳', desc: 'Open streets, highways, parks' },
  { id: 'Indoor', label: 'Indoor', icon: '🏬', desc: 'Malls, shops, venues' },
  { id: 'Home', label: 'Home', icon: '🏠', desc: 'Residential environment' },
  { id: 'Office', label: 'Office', icon: '🏢', desc: 'Workplace or corporate campus' },
  { id: 'Transit', label: 'Commute / Transit', icon: '🚆', desc: 'Metro, train, bus, vehicle' },
];

const FAQ_ITEMS = [
  {
    q: 'How does the QoS Speed test work?',
    a: 'Tests download and upload throughput using multi-threaded chunk streams conforming to the TRAI QoS measurement protocol.',
  },
  {
    q: 'What is the difference between Latency and Jitter?',
    a: 'Latency is the round-trip round time (RTT) for a packet to reach the QoS server. Jitter measures the statistical variance between consecutive ping probes.',
  },
  {
    q: 'How is Video Streaming performance tested?',
    a: 'Our video test measures Time to First Byte (TTFB), player startup delay, and buffer stability across simulated media chunk streams.',
  },
  {
    q: 'Does background monitoring exhaust mobile data?',
    a: 'Background probes are lightweight (1-2 MB). You can also enable "Wi-Fi Only Mode" under About Data Usage to completely prevent cellular quota consumption.',
  },
  {
    q: 'How long are test samples stored on the server?',
    a: 'Measurement telemetry uploaded to the backend is automatically purged after 90 days in accordance with automated data retention policies.',
  },
];

const TUTORIAL_VIDEOS = [
  {
    title: '1. Getting Started with NetSpeed Monitor',
    duration: '2:15 min',
    desc: 'Learn how to run 5G/4G QoS speed tests, monitor background telemetry, and understand latency.',
  },
  {
    title: '2. Understanding Video & Browser QoS Testing',
    duration: '3:40 min',
    desc: 'Deep-dive into video TTFB, buffer stall ratio, and simulated browsing experience scores.',
  },
  {
    title: '3. Exploring Network Coverage Heatmaps',
    duration: '4:10 min',
    desc: 'Navigate hexagonal cell coverage maps, switch between carriers, and inspect local verified grids.',
  },
  {
    title: '4. Exporting & Managing QoS Records',
    duration: '1:50 min',
    desc: 'Learn how to export measurement logs to CSV/JSON spreadsheets and manage backend retention.',
  },
];

export const SettingsView: React.FC<SettingsViewProps> = ({ onConfigChanged }) => {
  const { t, language, setLanguage } = useTranslation();
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

  // New Settings Sub-Modals
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [selectedLabel, setSelectedLabel] = useState('Outdoor');
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackCategory, setFeedbackCategory] = useState('General');
  const [feedbackComments, setFeedbackComments] = useState('');
  const [expandedFaq, setExpandedFaq] = useState<number | null>(0);

  const currentLanguageInfo =
    SUPPORTED_LANGUAGES.find(l => l.id === language) || SUPPORTED_LANGUAGES[0];

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
    sampleStore.setMaxHistoryLimit(maxHistoryLimit);

    const config = await getConfig();
    const activeServerUrl = serverUrl.trim() || config.serverUrl;

    const updated = await saveConfig({
      serverUrl: activeServerUrl,
      testIntervalSeconds: intervalSec,
      downloadMB,
      uploadMB,
      wifiOnly,
      maxHistoryLimit,
    });

    onConfigChanged(updated);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
    setActiveModal(null);
  };

  const handleExportPrompt = () => {
    Alert.alert(
      'Export Test History',
      'Choose the format to export your local measurement history:',
      [
        {
          text: '📊 Export as CSV (Spreadsheet)',
          onPress: async () => {
            const samples = await sampleStore.getHistory(0);
            await exportSamplesAsCSV(samples);
          },
        },
        {
          text: '📄 Export as JSON',
          onPress: async () => {
            const samples = await sampleStore.getHistory(0);
            await exportSamplesAsJSON(samples);
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const handleShareApp = async () => {
    try {
      await Share.share({
        message:
          'NetSpeed QoS Monitor — Measure real 5G/4G throughput, video delay, and network coverage. Conforms to TRAI QoS specifications.',
        title: 'NetSpeed QoS Monitor',
      });
    } catch {
      // ignore
    }
  };

  const handleRateApp = () => {
    const storeName = Platform.OS === 'ios' ? 'App Store' : 'Play Store';
    Alert.alert(
      `Rate on ${storeName}`,
      `Thank you for using NetSpeed QoS Monitor! Would you like to leave a review on the ${storeName}?`,
      [
        { text: 'Later', style: 'cancel' },
        {
          text: '⭐ Rate Now',
          onPress: () => {
            Alert.alert('Thank You', 'We appreciate your support and feedback!');
          },
        },
      ]
    );
  };

  const handleCopyUuid = () => {
    Alert.alert(
      'Device UUID',
      deviceId || 'Loading...',
      [
        {
          text: '📤 Share / Copy UUID',
          onPress: () => {
            Share.share({
              message: `NetSpeed Device UUID: ${deviceId}`,
            });
          },
        },
        { text: 'Done', style: 'cancel' },
      ]
    );
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

  const handleClearLocalData = async () => {
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

  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [isSyncingCloudHistory, setIsSyncingCloudHistory] = useState(false);

  const handleSendFeedback = async () => {
    if (!deviceId) return;
    setIsSubmittingFeedback(true);
    try {
      const res = await uploader.submitFeedback({
        deviceId,
        rating: feedbackRating,
        category: feedbackCategory,
        comment: feedbackComments.trim(),
      });
      if (res.success) {
        Alert.alert(
          'Feedback Submitted',
          `Thank you for giving ${feedbackRating} stars! Your feedback and QoS observations have been recorded on the central registry.`,
          [{ text: 'OK', onPress: () => setActiveModal(null) }]
        );
        setFeedbackComments('');
      } else {
        Alert.alert(
          'Feedback Notice',
          `Thank you for your rating! Note: ${res.error || 'Saved locally; will sync with backend'}.`,
          [{ text: 'OK', onPress: () => setActiveModal(null) }]
        );
      }
    } catch {
      Alert.alert('Feedback Recorded', 'Thank you for your feedback!');
      setActiveModal(null);
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  const handleRestoreFromCloud = async () => {
    if (!deviceId) return;
    setIsSyncingCloudHistory(true);
    try {
      const res = await uploader.fetchDeviceHistory(deviceId, 200);
      if (res.success && res.samples && res.samples.length > 0) {
        let imported = 0;
        for (const s of res.samples) {
          await sampleStore.add({
            id: s.id,
            device_id: s.device_id,
            ts: s.ts,
            test_type: s.test_type || 'speed',
            down_mbps: s.down_mbps,
            up_mbps: s.up_mbps,
            latency_ms: s.latency_ms,
            jitter_ms: s.jitter_ms,
            packet_loss_pct: s.packet_loss_pct,
            network: s.network,
            radio: s.radio,
            carrier: s.carrier,
            device_model: s.device_model,
            os_platform: s.os_platform,
            location_type: s.location_type,
            lat: s.lat,
            lng: s.lng,
            accuracy: s.accuracy,
          });
          imported++;
        }
        const capacity = await sampleStore.getCapacityInfo();
        setSampleCount(capacity.count);
        Alert.alert(
          'Cloud Sync Complete',
          `Successfully synchronized ${res.samples.length} measurement record(s) from the server!`
        );
      } else {
        Alert.alert('Cloud Sync', 'No historical records found for this device on the server.');
      }
    } catch (err: any) {
      Alert.alert('Sync Failed', err?.message || 'Unable to connect to server.');
    } finally {
      setIsSyncingCloudHistory(false);
    }
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
      {/* Screen Title */}
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>{t('settings_title', 'Settings')}</Text>
      </View>

      {savedSuccess && (
        <View style={styles.successBanner}>
          <Text style={styles.successBannerText}>✓ Configuration Saved Successfully</Text>
        </View>
      )}

      {/* SECTION 1: APP SETTINGS */}
      <View style={styles.sectionGroup}>
        <Text style={styles.sectionHeaderTitle}>{t('section_app_settings', 'App Settings')}</Text>

        {/* 1. App Language */}
        <TouchableOpacity
          style={styles.settingCardRow}
          onPress={() => setActiveModal('language')}
          activeOpacity={0.75}>
          <View style={[styles.iconBox, styles.iconBoxTeal]}>
            <LanguageIcon size={20} color="#00A389" />
          </View>
          <View style={styles.settingCardContent}>
            <Text style={styles.settingCardTitle}>{t('app_language', 'App Language')}</Text>
            <Text style={styles.settingCardSubtitle}>
              {currentLanguageInfo.name} ({currentLanguageInfo.native})
            </Text>
          </View>
          <ChevronRightIcon size={18} color="#94A3B8" />
        </TouchableOpacity>

        {/* 2. About Data Usage */}
        <TouchableOpacity
          style={styles.settingCardRow}
          onPress={() => setActiveModal('data_usage')}
          activeOpacity={0.75}>
          <View style={[styles.iconBox, styles.iconBoxBlue]}>
            <DataUsageIcon size={20} color="#0284C7" />
          </View>
          <View style={styles.settingCardContent}>
            <Text style={styles.settingCardTitle}>{t('about_data_usage', 'About Data Usage')}</Text>
            <Text style={styles.settingCardSubtitle}>
              {downloadMB}MB Down • {uploadMB}MB Up • {wifiOnly ? 'Wi-Fi Only' : 'Wi-Fi & Cellular'}
            </Text>
          </View>
          <ChevronRightIcon size={18} color="#94A3B8" />
        </TouchableOpacity>
      </View>

      {/* SECTION 2: SUPPORT & HELP */}
      <View style={styles.sectionGroup}>
        <Text style={styles.sectionHeaderTitle}>{t('section_support_help', 'Support & Help')}</Text>

        {/* 3. Frequently Asked Question */}
        <TouchableOpacity
          style={styles.settingCardRow}
          onPress={() => setActiveModal('faq')}
          activeOpacity={0.75}>
          <View style={[styles.iconBox, styles.iconBoxTeal]}>
            <FaqIcon size={20} color="#00A389" />
          </View>
          <View style={styles.settingCardContent}>
            <Text style={styles.settingCardTitle}>{t('faq', 'Frequently Asked Question')}</Text>
            <Text style={styles.settingCardSubtitle}>
              {t('faq_sub', 'QoS testing methodology & metrics')}
            </Text>
          </View>
          <ChevronRightIcon size={18} color="#94A3B8" />
        </TouchableOpacity>

        {/* 4. Watch Tutorial Videos */}
        <TouchableOpacity
          style={styles.settingCardRow}
          onPress={() => setActiveModal('tutorial')}
          activeOpacity={0.75}>
          <View style={[styles.iconBox, styles.iconBoxAmber]}>
            <TutorialVideoIcon size={20} color="#D97706" />
          </View>
          <View style={styles.settingCardContent}>
            <Text style={styles.settingCardTitle}>{t('watch_tutorials', 'Watch Tutorial Videos')}</Text>
            <Text style={styles.settingCardSubtitle}>
              {t('watch_tutorials_sub', 'Guides for speed, video & coverage')}
            </Text>
          </View>
          <ChevronRightIcon size={18} color="#94A3B8" />
        </TouchableOpacity>
      </View>

      {/* SECTION 3: ABOUT & FEEDBACK */}
      <View style={styles.sectionGroup}>
        <Text style={styles.sectionHeaderTitle}>{t('section_about_feedback', 'About & Feedback')}</Text>

        {/* 5. About Us */}
        <TouchableOpacity
          style={styles.settingCardRow}
          onPress={() => setActiveModal('about')}
          activeOpacity={0.75}>
          <View style={[styles.iconBox, styles.iconBoxBlue]}>
            <InfoCircleIcon size={20} color="#0284C7" />
          </View>
          <View style={styles.settingCardContent}>
            <Text style={styles.settingCardTitle}>{t('about_us', 'About Us')}</Text>
            <Text style={styles.settingCardSubtitle}>
              {t('about_us_sub', 'NetSpeed Monitor & TRAI regulations')}
            </Text>
          </View>
          <ChevronRightIcon size={18} color="#94A3B8" />
        </TouchableOpacity>

        {/* 6. Share App */}
        <TouchableOpacity
          style={styles.settingCardRow}
          onPress={handleShareApp}
          activeOpacity={0.75}>
          <View style={[styles.iconBox, styles.iconBoxTeal]}>
            <ShareAppIcon size={20} color="#00A389" />
          </View>
          <View style={styles.settingCardContent}>
            <Text style={styles.settingCardTitle}>{t('share_app', 'Share App')}</Text>
            <Text style={styles.settingCardSubtitle}>
              {t('share_app_sub', 'Share with friends & colleagues')}
            </Text>
          </View>
          <ChevronRightIcon size={18} color="#94A3B8" />
        </TouchableOpacity>

        {/* 7. Provide Feedback */}
        <TouchableOpacity
          style={styles.settingCardRow}
          onPress={() => setActiveModal('feedback')}
          activeOpacity={0.75}>
          <View style={[styles.iconBox, styles.iconBoxAmber]}>
            <StarFeedbackIcon size={20} color="#D97706" />
          </View>
          <View style={styles.settingCardContent}>
            <Text style={styles.settingCardTitle}>{t('provide_feedback', 'Provide Feedback')}</Text>
            <Text style={styles.settingCardSubtitle}>
              {t('provide_feedback_sub', 'Help us improve your experience')}
            </Text>
          </View>
          <ChevronRightIcon size={18} color="#94A3B8" />
        </TouchableOpacity>

        {/* 8. Rate on App Store / Play Store */}
        <TouchableOpacity
          style={styles.settingCardRow}
          onPress={handleRateApp}
          activeOpacity={0.75}>
          <View style={[styles.iconBox, styles.iconBoxBlue]}>
            <RateStoreIcon size={20} color="#0284C7" />
          </View>
          <View style={styles.settingCardContent}>
            <Text style={styles.settingCardTitle}>
              {Platform.OS === 'ios'
                ? t('rate_app_store', 'Rate on App Store')
                : t('rate_play_store', 'Rate on Play Store')}
            </Text>
            <Text style={styles.settingCardSubtitle}>
              {t('rate_sub', 'Leave a rating & review')}
            </Text>
          </View>
          <ChevronRightIcon size={18} color="#94A3B8" />
        </TouchableOpacity>
      </View>

      {/* SECTION 4: DATA & PRIVACY */}
      <View style={styles.sectionGroup}>
        <Text style={styles.sectionHeaderTitle}>{t('section_data_privacy', 'Data & Privacy')}</Text>

        {/* 9. Export Test Results */}
        <TouchableOpacity
          style={styles.settingCardRow}
          onPress={handleExportPrompt}
          activeOpacity={0.75}>
          <View style={[styles.iconBox, styles.iconBoxTeal]}>
            <ExportTrayIcon size={20} color="#00A389" />
          </View>
          <View style={styles.settingCardContent}>
            <Text style={styles.settingCardTitle}>{t('export_test_results', 'Export Test Results')}</Text>
            <Text style={styles.settingCardSubtitle}>
              {t('export_test_results_sub', 'Export records as CSV or JSON')}
            </Text>
          </View>
          <ChevronRightIcon size={18} color="#94A3B8" />
        </TouchableOpacity>

        {/* 10. Cloud History Sync & Restore */}
        <TouchableOpacity
          style={styles.settingCardRow}
          onPress={handleRestoreFromCloud}
          disabled={isSyncingCloudHistory}
          activeOpacity={0.75}>
          <View style={[styles.iconBox, styles.iconBoxBlue]}>
            <CloudUploadIcon size={20} color="#0284C7" />
          </View>
          <View style={styles.settingCardContent}>
            <Text style={styles.settingCardTitle}>Cloud History Sync & Restore</Text>
            <Text style={styles.settingCardSubtitle}>
              {isSyncingCloudHistory ? 'Syncing...' : 'Restore past measurements from server'}
            </Text>
          </View>
          {isSyncingCloudHistory ? (
            <ActivityIndicator size="small" color="#0284C7" />
          ) : (
            <ChevronRightIcon size={18} color="#94A3B8" />
          )}
        </TouchableOpacity>

        {/* 11. Add Test Label */}
        <TouchableOpacity
          style={styles.settingCardRow}
          onPress={() => setActiveModal('label')}
          activeOpacity={0.75}>
          <View style={[styles.iconBox, styles.iconBoxBlue]}>
            <TagLabelIcon size={20} color="#0284C7" />
          </View>
          <View style={styles.settingCardContent}>
            <Text style={styles.settingCardTitle}>{t('add_test_label', 'Add Test Label')}</Text>
            <Text style={styles.settingCardSubtitle}>Current: {selectedLabel}</Text>
          </View>
          <ChevronRightIcon size={18} color="#94A3B8" />
        </TouchableOpacity>

        {/* 11. Privacy Policy */}
        <TouchableOpacity
          style={styles.settingCardRow}
          onPress={() => setActiveModal('privacy')}
          activeOpacity={0.75}>
          <View style={[styles.iconBox, styles.iconBoxSlate]}>
            <LockPrivacyIcon size={20} color="#64748B" />
          </View>
          <View style={styles.settingCardContent}>
            <Text style={styles.settingCardTitle}>{t('privacy_policy', 'Privacy Policy')}</Text>
            <Text style={styles.settingCardSubtitle}>
              {t('privacy_policy_sub', 'Retention, GDPR & data deletion')}
            </Text>
          </View>
          <ChevronRightIcon size={18} color="#94A3B8" />
        </TouchableOpacity>
      </View>

      {/* FOOTER: VERSION & DEVICE UUID */}
      <View style={styles.footerContainer}>
        <Text style={styles.versionText}>{t('app_version', 'App Version')} : 1.9.1</Text>
        <TouchableOpacity
          style={styles.uuidBox}
          onPress={handleCopyUuid}
          activeOpacity={0.75}>
          <Text style={styles.uuidText} numberOfLines={1}>
            {t('uuid', 'UUID')} : {deviceId || 'Loading...'}
          </Text>
        </TouchableOpacity>
        <Text style={styles.uuidHintText}>{t('tap_to_copy_uuid', 'Tap UUID to share or copy')}</Text>
      </View>

      {/* ================= MODALS ================= */}

      {/* 1. LANGUAGE MODAL */}
      <Modal
        visible={activeModal === 'language'}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setActiveModal(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('select_language', 'Select App Language')}</Text>
              <TouchableOpacity onPress={() => setActiveModal(null)} style={styles.modalCloseBtn}>
                <CloseIcon size={18} color="#64748B" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScroll}>
              {SUPPORTED_LANGUAGES.map(lang => {
                const isSelected = language === lang.id;
                return (
                  <TouchableOpacity
                    key={lang.id}
                    style={[styles.modalOptionRow, isSelected && styles.modalOptionRowSelected]}
                    onPress={async () => {
                      await setLanguage(lang.id as SupportedLanguage);
                      setActiveModal(null);
                    }}
                    activeOpacity={0.7}>
                    <View>
                      <Text style={[styles.modalOptionTitle, isSelected && styles.modalOptionTitleSelected]}>
                        {lang.name}
                      </Text>
                      <Text style={styles.modalOptionSubtitle}>{lang.native}</Text>
                    </View>
                    {isSelected && <CheckCircleIcon size={20} color="#00A389" />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 2. ABOUT DATA USAGE & CADENCE MODAL */}
      <Modal
        visible={activeModal === 'data_usage'}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setActiveModal(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCardLarge}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>About Data Usage</Text>
              <TouchableOpacity onPress={() => setActiveModal(null)} style={styles.modalCloseBtn}>
                <CloseIcon size={18} color="#64748B" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.infoBanner}>
                <Text style={styles.infoBannerText}>
                  💡 Each automated test transmits small measurement chunk buffers to evaluate QoS without exhausting your cellular quota.
                </Text>
              </View>

              {/* Interval */}
              <Text style={styles.configLabel}>AUTOMATED BACKGROUND INTERVAL</Text>
              <View style={styles.pillGroup}>
                {intervalOptions.map(opt => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.pillBtn, intervalSec === opt.value && styles.pillBtnActive]}
                    onPress={() => setIntervalSec(opt.value)}>
                    <Text
                      style={[
                        styles.pillBtnText,
                        intervalSec === opt.value && styles.pillBtnTextActive,
                      ]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Download MB */}
              <Text style={styles.configLabel}>DOWNLOAD TEST PAYLOAD SIZE</Text>
              <View style={styles.pillGroup}>
                {payloadOptions.map(mb => (
                  <TouchableOpacity
                    key={mb}
                    style={[styles.pillBtn, downloadMB === mb && styles.pillBtnActive]}
                    onPress={() => setDownloadMB(mb)}>
                    <Text
                      style={[
                        styles.pillBtnText,
                        downloadMB === mb && styles.pillBtnTextActive,
                      ]}>
                      {mb} MB
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Upload MB */}
              <Text style={styles.configLabel}>UPLOAD TEST PAYLOAD SIZE</Text>
              <View style={styles.pillGroup}>
                {payloadOptions.slice(0, 3).map(mb => (
                  <TouchableOpacity
                    key={mb}
                    style={[styles.pillBtn, uploadMB === mb && styles.pillBtnActive]}
                    onPress={() => setUploadMB(mb)}>
                    <Text
                      style={[
                        styles.pillBtnText,
                        uploadMB === mb && styles.pillBtnTextActive,
                      ]}>
                      {mb} MB
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Wi-Fi Only Switch */}
              <View style={styles.switchBox}>
                <View style={styles.switchTextWrap}>
                  <Text style={styles.switchTitle}>Wi-Fi Only Mode</Text>
                  <Text style={styles.switchDesc}>Disables testing when on mobile cellular data</Text>
                </View>
                <Switch
                  value={wifiOnly}
                  onValueChange={setWifiOnly}
                  trackColor={{ false: '#E2E8F0', true: '#00A389' }}
                  thumbColor="#FFFFFF"
                />
              </View>

              {/* Max Local Capacity */}
              <Text style={styles.configLabel}>MAX LOCAL LOG STORAGE CAPACITY</Text>
              <View style={styles.pillGroup}>
                {historyLimitOptions.map(limit => (
                  <TouchableOpacity
                    key={limit}
                    style={[styles.pillBtn, maxHistoryLimit === limit && styles.pillBtnActive]}
                    onPress={() => setMaxHistoryLimit(limit)}>
                    <Text
                      style={[
                        styles.pillBtnText,
                        maxHistoryLimit === limit && styles.pillBtnTextActive,
                      ]}>
                      {limit.toLocaleString()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.capacityMetaText}>
                Currently storing {sampleCount} records locally.
              </Text>

              {/* Save Button */}
              <TouchableOpacity style={styles.primaryModalBtn} onPress={handleSave}>
                <Text style={styles.primaryModalBtnText}>Save Configuration</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 3. FAQ MODAL */}
      <Modal
        visible={activeModal === 'faq'}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setActiveModal(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCardLarge}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Frequently Asked Questions</Text>
              <TouchableOpacity onPress={() => setActiveModal(null)} style={styles.modalCloseBtn}>
                <CloseIcon size={18} color="#64748B" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              {FAQ_ITEMS.map((item, idx) => {
                const isOpen = expandedFaq === idx;
                return (
                  <TouchableOpacity
                    key={idx}
                    style={styles.faqCard}
                    onPress={() => setExpandedFaq(isOpen ? null : idx)}
                    activeOpacity={0.8}>
                    <View style={styles.faqHeader}>
                      <Text style={styles.faqQuestion}>{item.q}</Text>
                      <Text style={styles.faqChevron}>{isOpen ? '▲' : '▼'}</Text>
                    </View>
                    {isOpen && <Text style={styles.faqAnswer}>{item.a}</Text>}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 4. TUTORIAL VIDEOS MODAL */}
      <Modal
        visible={activeModal === 'tutorial'}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setActiveModal(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCardLarge}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Tutorial Videos & Guides</Text>
              <TouchableOpacity onPress={() => setActiveModal(null)} style={styles.modalCloseBtn}>
                <CloseIcon size={18} color="#64748B" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              {TUTORIAL_VIDEOS.map((vid, idx) => (
                <View key={idx} style={styles.tutorialCard}>
                  <View style={styles.tutorialThumb}>
                    <Text style={styles.tutorialPlayIcon}>▶</Text>
                    <Text style={styles.tutorialDurationBadge}>{vid.duration}</Text>
                  </View>
                  <View style={styles.tutorialContent}>
                    <Text style={styles.tutorialTitle}>{vid.title}</Text>
                    <Text style={styles.tutorialDesc}>{vid.desc}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 5. ABOUT US MODAL */}
      <Modal
        visible={activeModal === 'about'}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setActiveModal(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>About Us</Text>
              <TouchableOpacity onPress={() => setActiveModal(null)} style={styles.modalCloseBtn}>
                <CloseIcon size={18} color="#64748B" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScroll}>
              <Text style={styles.aboutAppName}>NetSpeed QoS Monitor</Text>
              <Text style={styles.aboutTagline}>
                Empowering consumers with objective, transparent cellular and Wi-Fi performance metrics.
              </Text>
              <View style={styles.aboutDivider} />
              <Text style={styles.aboutHeading}>TRAI Telemetry Standards</Text>
              <Text style={styles.aboutParagraph}>
                This application complies with QoS reporting guidelines established by the Telecom Regulatory Authority of India (TRAI), enabling consumers and regulators to identify coverage blindspots and evaluate actual QoS.
              </Text>
              <Text style={styles.aboutHeading}>Engineered By</Text>
              <Text style={styles.aboutParagraph}>Hare and Turtle AI Technologies Pvt. Ltd.</Text>
              <Text style={styles.aboutHeading}>Contact & Support</Text>
              <Text style={styles.aboutLink} onPress={() => Linking.openURL('mailto:support@hareandturtle.ai')}>
                support@hareandturtle.ai
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 6. PROVIDE FEEDBACK MODAL */}
      <Modal
        visible={activeModal === 'feedback'}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setActiveModal(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCardLarge}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Provide Feedback</Text>
              <TouchableOpacity onPress={() => setActiveModal(null)} style={styles.modalCloseBtn}>
                <CloseIcon size={18} color="#64748B" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScroll}>
              <Text style={styles.feedbackRatingLabel}>How would you rate your experience?</Text>
              <View style={styles.starRow}>
                {[1, 2, 3, 4, 5].map(star => (
                  <TouchableOpacity
                    key={star}
                    onPress={() => setFeedbackRating(star)}
                    style={styles.starTouch}>
                    <Text style={[styles.starIcon, star <= feedbackRating && styles.starIconActive]}>
                      ★
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.configLabel}>FEEDBACK TOPIC</Text>
              <View style={styles.pillGroup}>
                {['General', 'Speed Test', 'Coverage Map', 'Video Test', 'Bug Report'].map(cat => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.pillBtn, feedbackCategory === cat && styles.pillBtnActive]}
                    onPress={() => setFeedbackCategory(cat)}>
                    <Text
                      style={[
                        styles.pillBtnText,
                        feedbackCategory === cat && styles.pillBtnTextActive,
                      ]}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.configLabel}>YOUR COMMENTS</Text>
              <TextInput
                style={styles.feedbackInput}
                placeholder="Share your thoughts, issues, or suggestions..."
                placeholderTextColor="#94A3B8"
                multiline
                numberOfLines={4}
                value={feedbackComments}
                onChangeText={setFeedbackComments}
              />

              <TouchableOpacity style={styles.primaryModalBtn} onPress={handleSendFeedback}>
                <Text style={styles.primaryModalBtnText}>Submit Feedback</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 7. ADD TEST LABEL MODAL */}
      <Modal
        visible={activeModal === 'label'}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setActiveModal(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Test Environment Label</Text>
              <TouchableOpacity onPress={() => setActiveModal(null)} style={styles.modalCloseBtn}>
                <CloseIcon size={18} color="#64748B" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScroll}>
              <Text style={styles.modalDescText}>
                Tag your tests with their physical environment to identify indoor penetration vs outdoor signal strength:
              </Text>
              {AVAILABLE_LABELS.map(lbl => {
                const isSelected = selectedLabel === lbl.id;
                return (
                  <TouchableOpacity
                    key={lbl.id}
                    style={[styles.modalOptionRow, isSelected && styles.modalOptionRowSelected]}
                    onPress={() => {
                      setSelectedLabel(lbl.id);
                      setActiveModal(null);
                    }}
                    activeOpacity={0.7}>
                    <View style={styles.labelOptionLeft}>
                      <Text style={styles.labelOptionIcon}>{lbl.icon}</Text>
                      <View>
                        <Text style={[styles.modalOptionTitle, isSelected && styles.modalOptionTitleSelected]}>
                          {lbl.label}
                        </Text>
                        <Text style={styles.modalOptionSubtitle}>{lbl.desc}</Text>
                      </View>
                    </View>
                    {isSelected && <CheckCircleIcon size={20} color="#00A389" />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 8. PRIVACY POLICY MODAL */}
      <Modal
        visible={activeModal === 'privacy'}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setActiveModal(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCardLarge}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Data Retention & Privacy</Text>
              <TouchableOpacity onPress={() => setActiveModal(null)} style={styles.modalCloseBtn}>
                <CloseIcon size={18} color="#64748B" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.retentionCard}>
                <View style={styles.retentionHeaderRow}>
                  <Text style={styles.retentionHeading}>90-Day Auto-Purge Policy</Text>
                  <View style={styles.retentionPillBadge}>
                    <Text style={styles.retentionPillBadgeText}>Automated</Text>
                  </View>
                </View>
                <Text style={styles.retentionBody}>
                  NetSpeed QoS Monitor retains network measurement records on its backend for up to <Text style={styles.boldText}>90 days</Text> from the date they are recorded. Records older than this period are automatically deleted by scheduled data-retention scripts.
                </Text>
              </View>

              <View style={styles.noticeBox}>
                <Text style={styles.noticeBoxText}>
                  ⚠️ Deleting this app does not automatically delete measurements already uploaded to the backend. Use the deletion options below to immediately purge your telemetry data.
                </Text>
              </View>

              <TouchableOpacity
                style={styles.actionModalBtn}
                onPress={handleEmailDeletionRequest}>
                <Text style={styles.actionModalBtnText}>✉️ Email Deletion Request</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionModalBtn, styles.actionModalWipeBtn]}
                onPress={handleServerDataDeletion}
                disabled={isDeletingServerData}>
                {isDeletingServerData ? (
                  <ActivityIndicator size="small" color="#DC2626" />
                ) : (
                  <Text style={styles.actionModalWipeBtnText}>🗑 Wipe Server Records for this UUID</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionModalBtn, styles.actionModalSecondaryBtn]}
                onPress={() => Linking.openURL('https://hareandturtle.ai/privacy-policy.html')}>
                <Text style={styles.actionModalSecondaryBtnText}>🔒 View Full Web Privacy Policy</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionModalBtn, styles.actionModalClearBtn]}
                onPress={handleClearLocalData}>
                <Text style={styles.actionModalClearBtnText}>🗑 Clear All Local Samples & History</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F6FA',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 40,
  },
  headerRow: {
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.4,
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
  sectionGroup: {
    marginBottom: 20,
  },
  sectionHeaderTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
    paddingLeft: 4,
  },
  settingCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 5,
    elevation: 1,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  iconBoxTeal: {
    backgroundColor: '#E6F8F5',
  },
  iconBoxBlue: {
    backgroundColor: '#E0F2FE',
  },
  iconBoxAmber: {
    backgroundColor: '#FEF3C7',
  },
  iconBoxSlate: {
    backgroundColor: '#F1F5F9',
  },
  settingCardContent: {
    flex: 1,
  },
  settingCardTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  settingCardSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  footerContainer: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  versionText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 8,
  },
  uuidBox: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    width: '100%',
    alignItems: 'center',
  },
  uuidText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
    fontVariant: ['tabular-nums'],
  },
  uuidHintText: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 4,
  },

  /* Modals */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: 36,
    maxHeight: '75%',
  },
  modalCardLarge: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: 36,
    maxHeight: '88%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalScroll: {
    paddingVertical: 4,
  },
  modalDescText: {
    fontSize: 12.5,
    color: '#64748B',
    lineHeight: 18,
    marginBottom: 14,
  },
  modalOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalOptionRowSelected: {
    backgroundColor: '#E6F8F5',
    borderColor: '#00A389',
  },
  modalOptionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
  modalOptionTitleSelected: {
    color: '#00A389',
    fontWeight: '800',
  },
  modalOptionSubtitle: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  infoBanner: {
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  infoBannerText: {
    fontSize: 11.5,
    color: '#1E40AF',
    lineHeight: 16,
  },
  configLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 10,
    marginBottom: 6,
  },
  pillGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  pillBtn: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  pillBtnActive: {
    backgroundColor: '#00A389',
    borderColor: '#00A389',
  },
  pillBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  pillBtnTextActive: {
    color: '#FFFFFF',
  },
  switchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginVertical: 8,
  },
  switchTextWrap: {
    flex: 1,
    paddingRight: 10,
  },
  switchTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  switchDesc: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  capacityMetaText: {
    fontSize: 11,
    color: '#94A3B8',
    marginBottom: 12,
  },
  primaryModalBtn: {
    backgroundColor: '#00A389',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  primaryModalBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  faqCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  faqHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  faqQuestion: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
    flex: 1,
    paddingRight: 8,
  },
  faqChevron: {
    fontSize: 10,
    color: '#64748B',
  },
  faqAnswer: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  tutorialCard: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  tutorialThumb: {
    width: 68,
    height: 60,
    backgroundColor: '#0F172A',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  tutorialPlayIcon: {
    color: '#FFFFFF',
    fontSize: 18,
  },
  tutorialDurationBadge: {
    position: 'absolute',
    bottom: 3,
    right: 4,
    fontSize: 8.5,
    color: '#94A3B8',
    fontWeight: '700',
  },
  tutorialContent: {
    flex: 1,
  },
  tutorialTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 3,
  },
  tutorialDesc: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 15,
  },
  aboutAppName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  aboutTagline: {
    fontSize: 12.5,
    color: '#64748B',
    lineHeight: 18,
  },
  aboutDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 12,
  },
  aboutHeading: {
    fontSize: 12,
    fontWeight: '800',
    color: '#00A389',
    textTransform: 'uppercase',
    marginTop: 8,
    marginBottom: 2,
  },
  aboutParagraph: {
    fontSize: 12.5,
    color: '#334155',
    lineHeight: 18,
    marginBottom: 6,
  },
  aboutLink: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0284C7',
    marginBottom: 16,
  },
  feedbackRatingLabel: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
    marginVertical: 6,
  },
  starRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 12,
  },
  starTouch: {
    padding: 6,
  },
  starIcon: {
    fontSize: 32,
    color: '#CBD5E1',
  },
  starIconActive: {
    color: '#F59E0B',
  },
  feedbackInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    padding: 10,
    fontSize: 13,
    color: '#0F172A',
    height: 80,
    textAlignVertical: 'top',
    marginBottom: 10,
  },
  labelOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  labelOptionIcon: {
    fontSize: 22,
  },
  retentionCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  retentionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  retentionHeading: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  retentionPillBadge: {
    backgroundColor: '#CCFBF1',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  retentionPillBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0F766E',
  },
  retentionBody: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
  },
  boldText: {
    fontWeight: '800',
    color: '#0F172A',
  },
  noticeBox: {
    backgroundColor: '#FEF3C7',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 12,
  },
  noticeBoxText: {
    fontSize: 11.5,
    color: '#92400E',
    lineHeight: 16,
  },
  actionModalBtn: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 8,
  },
  actionModalBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#334155',
  },
  actionModalWipeBtn: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  actionModalWipeBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#DC2626',
  },
  actionModalSecondaryBtn: {
    backgroundColor: '#F0FDFA',
    borderColor: '#99F6E4',
  },
  actionModalSecondaryBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F766E',
  },
  actionModalClearBtn: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
    marginBottom: 24,
  },
  actionModalClearBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#64748B',
  },
});
