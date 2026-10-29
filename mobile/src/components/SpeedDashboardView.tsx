import React, { useState, useEffect, useRef } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  RefreshControl,
  Alert,
  Platform,
} from 'react-native';
import { AppConfig, Sample } from '../types';
import { getDeviceId } from '../config';
import { generateUUID } from '../utils/uuid';
import { EXPERIENCE_LABELS } from '../config/coverageThresholds';
import { sampleStore } from '../services/sampleStore';
import { uploader } from '../services/uploader';
import { SpeedGauge } from './SpeedGauge';
import { MonitorStatus } from '../services/monitorService';
import { SpeedTestProgressView } from './SpeedTestProgressView';
import { SpeedTestResultView } from './SpeedTestResultView';
import {
  VideoBrowserTestProgressView,
  VideoBrowserTestResults,
} from './VideoBrowserTestProgressView';
import { VideoBrowserTestResultView } from './VideoBrowserTestResultView';
import {
  CoverageTestProgressView,
  CoverageTestResults,
} from './CoverageTestProgressView';
import { CoverageTestResultView } from './CoverageTestResultView';
import { AdvanceTestModal } from './AdvanceTestModal';
import {
  ContinuousTestSetupView,
  ContinuousTestConfig,
} from './ContinuousTestSetupView';
import {
  ContinuousTestProgressView,
  ContinuousTestSessionResults,
} from './ContinuousTestProgressView';
import { ContinuousTestResultView } from './ContinuousTestResultView';
import {
  ScheduledTestSetupView,
  ScheduledTestConfig,
} from './ScheduledTestSetupView';
import {
  PlayIcon,
  StopIcon,
  LightningIcon,
  VideoBrowserTestIcon,
  CoverageTestIcon,
  AdvanceTestsIcon,
  SignalBarsIcon,
  ChevronRightIcon,
} from './Icons';
import { useTranslation } from '../i18n';
import {
  continuousTestService,
  useContinuousSession,
} from '../services/continuousTestService';
import {
  scheduledTestService,
  useScheduleState,
  getNextRunAt,
  describeSchedule,
} from '../services/scheduledTestService';

const formatScheduleTime = (ts: number) =>
  new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export type TestType = 'speed' | 'video_browser' | 'coverage' | 'advance';
export type ScreenMode =
  | 'home'
  | 'testing'
  | 'result'
  | 'video_testing'
  | 'video_result'
  | 'coverage_testing'
  | 'coverage_result'
  | 'continuous_setup'
  | 'continuous_testing'
  | 'continuous_result'
  | 'schedule_setup';


interface SpeedDashboardViewProps {
  config: AppConfig | null;
  status: MonitorStatus;
  refreshing: boolean;
  onRefresh: () => void;
  onToggleMonitoring: () => void;
  onTestNow: () => void;
  onNavigateTab?: (tab: 'SPEED' | 'MAP' | 'HISTORY' | 'SETTINGS') => void;
  onFullScreenChange?: (isFullScreen: boolean, hideTopOnly?: boolean) => void;
}

export const SpeedDashboardView: React.FC<SpeedDashboardViewProps> = ({
  config: _config,
  status,
  refreshing,
  onRefresh,
  onToggleMonitoring,
  onTestNow,
  onNavigateTab,
  onFullScreenChange,
}) => {
  const { t } = useTranslation();
  const [activeTestType, setActiveTestType] = useState<TestType>('speed');
  const [screenMode, setScreenMode] = useState<ScreenMode>('home');

  // Video & Browser Test State
  const [videoResults, setVideoResults] = useState<VideoBrowserTestResults | null>(null);
  // Coverage Test State
  const [coverageResults, setCoverageResults] = useState<CoverageTestResults | null>(null);
  // Advance Tests Modal State
  const [showAdvanceModal, setShowAdvanceModal] = useState<boolean>(false);

  // Schedule and Continuous Test active states
  // Continuous & scheduled tests live in services, so they keep running across
  // tab switches, screen-off and background; this view only reflects their state.
  const scheduleState = useScheduleState();
  const activeSchedule: ScheduledTestConfig | null = scheduleState.config;
  const scheduleNextRunAt = getNextRunAt(scheduleState);
  const continuousSession = useContinuousSession();
  const isContinuousRunning = continuousSession.active;
  const continuousConfig: ContinuousTestConfig | null = continuousSession.config;
  const [continuousResults, setContinuousResults] = useState<ContinuousTestSessionResults | null>(null);
  const showContinuousFinished =
    !continuousSession.active && !!continuousSession.lastResults && !continuousSession.resultsSeen;

  const openContinuousResults = (res: ContinuousTestSessionResults) => {
    continuousTestService.markResultsSeen();
    setContinuousResults(res);
    setScreenMode('continuous_result');
  };

  const stopContinuous = () => {
    continuousTestService.stop().then(res => {
      if (res) {
        openContinuousResults(res);
      }
    });
  };
  const [nearbyCoverage, setNearbyCoverage] = useState<any>(null);

  useEffect(() => {
    if (status.lastSample?.lat && status.lastSample?.lng) {
      uploader
        .fetchNearbyCoverage(status.lastSample.lat, status.lastSample.lng, 5)
        .then(res => {
          if (res.success && res.data?.operators?.length > 0) {
            setNearbyCoverage(res.data);
          }
        })
        .catch(() => {});
    }
  }, [status.lastSample?.lat, status.lastSample?.lng]);
  // Auto transition between home -> testing -> result (ONLY for manual speed test on home)
  const prevTestingRef = useRef(status.isTesting);
  useEffect(() => {
    // Only transition into 'testing' if user is on 'home' and a manual speed test started
    if (!prevTestingRef.current && status.isTesting) {
      if (screenMode === 'home' && activeTestType === 'speed') {
        setScreenMode('testing');
      }
    } else if (prevTestingRef.current && !status.isTesting) {
      // Only transition out of 'testing' if user was actually on 'testing'
      if (screenMode === 'testing') {
        if (status.lastSample) {
          setScreenMode('result');
        } else {
          setScreenMode('home');
        }
      }
    }
    prevTestingRef.current = status.isTesting;
  }, [status.isTesting, status.lastSample, screenMode, activeTestType]);

  // Notify parent if full screen mode is active
  useEffect(() => {
    if (screenMode === 'continuous_setup' || screenMode === 'schedule_setup') {
      onFullScreenChange?.(false, true);
    } else if (screenMode !== 'home') {
      onFullScreenChange?.(true, false);
    } else {
      onFullScreenChange?.(false, false);
    }
  }, [screenMode, onFullScreenChange]);

  const last = status.lastSample;
  const lastSpeed = last?.down_mbps ?? 0;

  const carrierName =
    last?.carrier && last.carrier !== '--' && last.carrier !== 'wifi'
      ? last.carrier
      : last?.network === 'wifi'
        ? 'Wi-Fi'
        : last?.radio || 'Cellular';

  const radioTech = last?.radio || (last?.network === 'wifi' ? 'Wi-Fi' : '4G');
  const carrierPillText = `${carrierName}_${radioTech}`;

  // Header pill shows measured network experience only (no estimated dBm)
  const networkPillText = coverageResults
    ? `Experience: ${EXPERIENCE_LABELS[coverageResults.experience]}`
    : last?.latency_ms != null
      ? `Latency: ${Math.round(last.latency_ms)} ms`
      : 'Experience: Not measured';

  const handleStartCurrentTest = () => {
    if (activeTestType === 'speed') {
      setScreenMode('testing');
      onTestNow();
    } else if (activeTestType === 'video_browser') {
      setScreenMode('video_testing');
    } else if (activeTestType === 'coverage') {
      setScreenMode('coverage_testing');
    } else if (activeTestType === 'advance') {
      setShowAdvanceModal(true);
    }
  };

  // 1. RENDER SPEED TESTING SCREEN (Screenshot 1)
  if (screenMode === 'testing') {
    return (
      <SpeedTestProgressView
        status={status}
        onCancel={() => setScreenMode('home')}
      />
    );
  }

  // 2. RENDER SPEED RESULT SCREEN (Screenshot 2)
  if (screenMode === 'result') {
    return (
      <SpeedTestResultView
        sample={status.lastSample}
        testId={status.lastSample?.id ? status.lastSample.id.slice(-2) : '9'}
        onBack={() => setScreenMode('home')}
        onRunVideoBrowserTest={() => {
          setActiveTestType('video_browser');
          setScreenMode('video_testing');
        }}
      />
    );
  }

  // 3. RENDER VIDEO & BROWSER TESTING SCREEN (Screenshot 3)
  if (screenMode === 'video_testing') {
    return (
      <VideoBrowserTestProgressView
        onCancel={() => setScreenMode('home')}
        onComplete={res => {
          setVideoResults(res);
          setScreenMode('video_result');
          const base = status.lastSample;
          const s: Sample = {
            id: `vid_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            device_id: base?.device_id || 'dev',
            ts: Math.floor(Date.now() / 1000),
            down_mbps: res.ttfbMs ? parseFloat((1200 / res.ttfbMs * 12).toFixed(1)) : (base?.down_mbps || 32.5),
            up_mbps: base?.up_mbps || 14.0,
            latency_ms: res.videoDelayMs || 42,
            jitter_ms: 10.5,
            packet_loss_pct: 0,
            network: base?.network || 'cellular',
            radio: base?.radio || '5G',
            carrier: base?.carrier || 'Airtel',
            device_model: base?.device_model || 'Mobile Device',
            os_platform: base?.os_platform || 'Mobile OS',
            location_type: base?.location_type || 'Outdoor',
            lat: base?.lat ?? null,
            lng: base?.lng ?? null,
            accuracy: base?.accuracy ?? null,
            test_type: 'video',
          };
          sampleStore.add(s);
        }}
      />
    );
  }

  // 4. RENDER VIDEO & BROWSER RESULT SCREEN
  if (screenMode === 'video_result') {
    return (
      <VideoBrowserTestResultView
        results={videoResults}
        sample={status.lastSample}
        testId={status.lastSample?.id ? status.lastSample.id.slice(-2) : '10'}
        onBack={() => setScreenMode('home')}
        onRunSpeedTest={() => {
          setActiveTestType('speed');
          setScreenMode('testing');
          onTestNow();
        }}
      />
    );
  }

  // 5. RENDER COVERAGE TESTING SCREEN
  if (screenMode === 'coverage_testing') {
    return (
      <CoverageTestProgressView
        status={status}
        onCancel={() => setScreenMode('home')}
        onComplete={async res => {
          setCoverageResults(res);
          setScreenMode('coverage_result');
          // Store exactly what was measured; unmeasured values stay null.
          const s: Sample = {
            id: generateUUID(),
            device_id: await getDeviceId(),
            ts: Math.floor(Date.now() / 1000),
            down_mbps: res.downMbps,
            up_mbps: null,
            latency_ms: res.latencyMs,
            jitter_ms: res.jitterMs,
            packet_loss_pct: res.packetLossPct,
            network: res.network,
            radio: res.radioTech,
            carrier: res.carrierName,
            device_model: Platform.OS === 'ios' ? 'Apple iPhone' : 'Android Device',
            os_platform: `${Platform.OS} ${Platform.Version}`,
            location_type: null,
            lat: res.lat,
            lng: res.lng,
            accuracy: res.gpsAccuracy,
            test_type: 'coverage',
            signal_dbm: res.signalDbm,
            cell_tower: res.cellTower,
            frequency_band: res.frequencyBand,
            measurement_source:
              Platform.OS === 'ios' ? 'ios_network_experience' : 'android_network_experience',
            quality_category: res.experience,
            failure_reason: res.failureReason,
          };
          sampleStore.add(s);
        }}
      />
    );
  }

  // 6. RENDER COVERAGE RESULT SCREEN
  if (screenMode === 'coverage_result') {
    return (
      <CoverageTestResultView
        sample={status.lastSample}
        results={coverageResults}
        onBack={() => setScreenMode('home')}
        onRunSpeedTest={() => {
          setActiveTestType('speed');
          setScreenMode('testing');
          onTestNow();
        }}
        onOpenMap={() => {
          setScreenMode('home');
          onNavigateTab?.('MAP');
        }}
      />
    );
  }

  // 7. RENDER CONTINUOUS SETUP SCREEN
  if (screenMode === 'continuous_setup') {
    return (
      <ContinuousTestSetupView
        isRunning={isContinuousRunning}
        activeConfig={continuousConfig}
        onBack={() => setScreenMode('home')}
        onStartTest={cfg => {
          continuousTestService.start(cfg);
          setScreenMode('continuous_testing');
        }}
        onStopTest={() => {
          continuousTestService.stop().then(() => continuousTestService.markResultsSeen());
          Alert.alert('Continuous Test Stopped', 'Continuous testing has been halted.');
        }}
      />
    );
  }

  // 8. RENDER CONTINUOUS TESTING EXECUTION SCREEN
  if (screenMode === 'continuous_testing' && continuousConfig) {
    return (
      <ContinuousTestProgressView
        config={continuousConfig}
        status={status}
        // Every cycle is saved as its own real sample by continuousTestService
        onStop={openContinuousResults}
        onComplete={openContinuousResults}
        onMinimize={() => setScreenMode('home')}
      />
    );
  }

  // 9. RENDER CONTINUOUS RESULT SCREEN
  if (screenMode === 'continuous_result' && continuousResults) {
    return (
      <ContinuousTestResultView
        results={continuousResults}
        onBackToHome={() => setScreenMode('home')}
        onRestartTest={() => {
          if (continuousConfig) {
            continuousTestService.start(continuousConfig);
            setScreenMode('continuous_testing');
          } else {
            setScreenMode('continuous_setup');
          }
        }}
      />
    );
  }


  // 8. RENDER SCHEDULED SETUP SCREEN (Screenshot 3)
  if (screenMode === 'schedule_setup') {
    return (
      <ScheduledTestSetupView
        activeSchedule={activeSchedule}
        onBack={() => setScreenMode('home')}
        onScheduleTest={cfg => {
          scheduledTestService.setSchedule(cfg);
          Alert.alert(
            'Test Scheduled',
            `Your automated test runs ${describeSchedule(cfg)}, from ${cfg.fromDate} to ${cfg.toDate}.`
          );
        }}
        onDisableSchedule={() => {
          scheduledTestService.clearSchedule();
          Alert.alert(
            'Schedule Disabled',
            'Automated scheduled testing has been disabled.'
          );
        }}
      />
    );
  }

  // Active Continuous Test Status & Stop Button (or "finished" shortcut to results)
  const renderContinuousCard = () => {
    if (isContinuousRunning && continuousConfig) {
      const remainingMins = continuousSession.endsAt
        ? Math.max(0, Math.ceil((continuousSession.endsAt - Date.now()) / 60000))
        : continuousConfig.durationMins;
      return (
        <TouchableOpacity
          style={styles.activeScheduleDashboardCard}
          onPress={() => setScreenMode('continuous_testing')}
          activeOpacity={0.85}>
          <View style={styles.activeScheduleDashboardLeft}>
            <View style={styles.statusDotLive} />
            <View>
              <Text style={styles.activeScheduleDashboardTitle}>
                Continuous Testing Active ({continuousConfig.testType.toUpperCase()})
              </Text>
              <Text style={styles.activeScheduleDashboardSub}>
                Interval: {continuousConfig.gapSeconds}s • Duration: {continuousConfig.durationMins}m
              </Text>
              <Text style={styles.activeScheduleDashboardSub}>
                Cycle #{Math.max(1, continuousSession.currentCycle)} • ~{remainingMins}m left • Tap to view
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.disableSmallBtn}
            onPress={stopContinuous}
            activeOpacity={0.8}>
            <Text style={styles.disableSmallBtnText}>Stop</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      );
    }
    if (showContinuousFinished && continuousSession.lastResults) {
      const res = continuousSession.lastResults;
      return (
        <TouchableOpacity
          style={styles.activeScheduleDashboardCard}
          onPress={() => openContinuousResults(res)}
          activeOpacity={0.85}>
          <View style={styles.activeScheduleDashboardLeft}>
            <View>
              <Text style={styles.activeScheduleDashboardTitle}>
                Continuous Test Finished ({res.testType.toUpperCase()})
              </Text>
              <Text style={styles.activeScheduleDashboardSub}>
                {res.totalCyclesCompleted} cycles • Tap to view results
              </Text>
            </View>
          </View>
          <ChevronRightIcon size={18} color="#64748B" />
        </TouchableOpacity>
      );
    }
    return null;
  };

  // 3. RENDER MAIN HOME TAB (Clean, with START button and 4 test buttons)
  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#00A389"
          colors={['#00A389']}
        />
      }>
      {/* Main Center Gauge Card with START Button */}
      <View style={styles.gaugeCard}>
        {/* Top Header Pills (Network & Coverage dBm matching reference mockup) */}
        <View style={styles.topPillsRow}>
          <View style={styles.networkPill}>
            <Text style={styles.networkPillText}>{carrierPillText}</Text>
            <View style={styles.statusDotGreen} />
          </View>

          <View style={styles.coveragePill}>
            <SignalBarsIcon size={14} color="#10B981" />
            <Text style={styles.coveragePillText}>{networkPillText}</Text>
          </View>
        </View>

        {/* Central START Button / Speed Gauge */}
        <View style={styles.startGaugeContainer}>
          <SpeedGauge
            value={lastSpeed}
            maxValue={100}
            label={t('download', 'DOWNLOAD')}
            unit="Mbps"
            phase="idle"
            isTesting={false}
            onStart={handleStartCurrentTest}
            startLabel={t('start_btn', 'START')}
          />
        </View>

        {/* 2x2 Grid of 4 Test Buttons (Speed Test, Video & Browser Test, Coverage Test, Advance Tests) */}
        <View style={styles.testButtonsGrid}>
          {/* Row 1: Speed Test & Video & Browser Test */}
          <View style={styles.testButtonsRow}>
            <TouchableOpacity
              style={[
                styles.testButton,
                activeTestType === 'speed' ? styles.testButtonActive : styles.testButtonInactive,
              ]}
              onPress={() => setActiveTestType('speed')}
              activeOpacity={0.85}>
              <LightningIcon
                size={16}
                color={activeTestType === 'speed' ? '#0F172A' : '#64748B'}
              />
              <Text
                style={[
                  styles.testButtonText,
                  activeTestType === 'speed'
                    ? styles.testButtonTextActive
                    : styles.testButtonTextInactive,
                ]}>
                {t('filter_speed', 'Speed')} Test
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.testButton,
                activeTestType === 'video_browser'
                  ? styles.testButtonActive
                  : styles.testButtonInactive,
              ]}
              onPress={() => setActiveTestType('video_browser')}
              activeOpacity={0.85}>
              <VideoBrowserTestIcon
                size={16}
                color={activeTestType === 'video_browser' ? '#0F172A' : '#64748B'}
              />
              <Text
                style={[
                  styles.testButtonText,
                  activeTestType === 'video_browser'
                    ? styles.testButtonTextActive
                    : styles.testButtonTextInactive,
                ]}>
                {t('filter_video', 'Video')} & Browser
              </Text>
            </TouchableOpacity>
          </View>

          {/* Row 2: Coverage Test & Advance Tests */}
          <View style={styles.testButtonsRow}>
            <TouchableOpacity
              style={[
                styles.testButton,
                activeTestType === 'coverage' ? styles.testButtonActive : styles.testButtonInactive,
              ]}
              onPress={() => setActiveTestType('coverage')}
              activeOpacity={0.85}>
              <CoverageTestIcon
                size={16}
                color={activeTestType === 'coverage' ? '#0F172A' : '#64748B'}
              />
              <Text
                style={[
                  styles.testButtonText,
                  activeTestType === 'coverage'
                    ? styles.testButtonTextActive
                    : styles.testButtonTextInactive,
                ]}>
                {t('filter_coverage', 'Coverage')} Test
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.testButton,
                activeTestType === 'advance' ? styles.testButtonActive : styles.testButtonInactive,
              ]}
              onPress={() => {
                setActiveTestType('advance');
                setShowAdvanceModal(true);
              }}
              activeOpacity={0.85}>
              <AdvanceTestsIcon
                size={16}
                color={activeTestType === 'advance' ? '#0F172A' : '#64748B'}
              />
              <Text
                style={[
                  styles.testButtonText,
                  activeTestType === 'advance'
                    ? styles.testButtonTextActive
                    : styles.testButtonTextInactive,
                ]}>
                {t('filter_advance', 'Advance')} Tests
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Content below the 4 buttons (Clean and minimal as requested) */}

      {/* 1. SPEED TEST MODE */}
      {activeTestType === 'speed' && (
        <View style={styles.modeContainer}>
          {/* Quick View Last Result Card if a previous test exists */}
          {last && (
            <TouchableOpacity
              style={styles.viewResultCard}
              onPress={() => setScreenMode('result')}
              activeOpacity={0.85}>
              <View style={styles.viewResultLeft}>
                <View style={styles.viewResultIconCircle}>
                  <LightningIcon size={16} color="#00A389" />
                </View>
                <View>
                  <Text style={styles.viewResultTitle}>{t('latest_test_result', 'Latest Test Result')}</Text>
                  <Text style={styles.viewResultSubtitle}>
                    {last.down_mbps != null ? `${last.down_mbps.toFixed(1)} Mbps Down` : '--'} •{' '}
                    {last.latency_ms != null ? `${Math.round(last.latency_ms)} ms` : '--'}
                  </Text>
                </View>
              </View>
              <View style={styles.viewResultArrow}>
                <Text style={styles.viewResultDetailsText}>{t('view_details', 'View Details')}</Text>
                <ChevronRightIcon size={16} color="#00A389" />
              </View>
            </TouchableOpacity>
          )}

          {/* Background Monitoring Control Card */}
          <View style={styles.monitoringControlCard}>
            <View style={styles.monitoringLeft}>
              <View
                style={[
                  styles.statusIndicatorDot,
                  status.isRunning ? styles.statusDotLive : styles.statusDotOff,
                ]}
              />
              <View>
                <Text style={styles.monitoringTitle}>{t('background_monitoring', 'Background QoS Monitoring')}</Text>
                <Text style={styles.monitoringSubtitle}>
                  {status.isRunning ? t('status_active', 'Active (Recording samples)') : t('status_idle', 'Idle (Tap to start)')}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[
                styles.monitoringToggleBtn,
                status.isRunning ? styles.monitoringStopBtn : styles.monitoringStartBtn,
              ]}
              onPress={onToggleMonitoring}
              activeOpacity={0.8}>
              {status.isRunning ? (
                <>
                  <StopIcon size={13} color="#FFFFFF" />
                  <Text style={styles.monitoringBtnText}>{t('stop_test', 'Stop')}</Text>
                </>
              ) : (
                <>
                  <PlayIcon size={13} color="#FFFFFF" />
                  <Text style={styles.monitoringBtnText}>{t('start_btn', 'Start')}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Nearby Operator QoS Intelligence Card */}
          {nearbyCoverage && nearbyCoverage.operators?.length > 0 && (
            <View style={styles.nearbyCard}>
              <View style={styles.nearbyHeaderRow}>
                <Text style={styles.nearbyTitle}>⚡ Top Operator in Your Area</Text>
                <Text style={styles.nearbyRadiusText}>Within {nearbyCoverage.radius_km} km</Text>
              </View>
              <View style={styles.nearbyOpRow}>
                <Text style={styles.nearbyOpName}>{nearbyCoverage.operators[0].carrier}</Text>
                <Text style={styles.nearbyOpSpeed}>
                  Avg {nearbyCoverage.operators[0].avg_down_mbps} Mbps • {nearbyCoverage.operators[0].avg_latency_ms} ms latency
                </Text>
              </View>
            </View>
          )}
        </View>
      )}

      {/* 2. VIDEO & BROWSER TEST MODE */}
      {activeTestType === 'video_browser' && (
        <View style={styles.modeContainer}>
          {/* Quick View Last Result Card if a previous video test exists */}
          {videoResults && (
            <TouchableOpacity
              style={styles.viewResultCard}
              onPress={() => setScreenMode('video_result')}
              activeOpacity={0.85}>
              <View style={styles.viewResultLeft}>
                <View style={styles.viewResultIconCircle}>
                  <VideoBrowserTestIcon size={16} color="#00A389" />
                </View>
                <View>
                  <Text style={styles.viewResultTitle}>Latest Video & Browser Result</Text>
                  <Text style={styles.viewResultSubtitle}>
                    {videoResults.videoDelayMs} ms Video Delay • {videoResults.webDelayMs} ms Web Delay
                  </Text>
                </View>
              </View>
              <View style={styles.viewResultArrow}>
                <Text style={styles.viewResultDetailsText}>View Details</Text>
                <ChevronRightIcon size={16} color="#00A389" />
              </View>
            </TouchableOpacity>
          )}

          {/* Start Video & Browser Test Action */}
          <TouchableOpacity
            style={styles.fullWidthActionBtn}
            onPress={() => setScreenMode('video_testing')}
            activeOpacity={0.85}>
            <VideoBrowserTestIcon size={18} color="#FFFFFF" />
            <Text style={styles.fullWidthActionBtnText}>Start Video & Browser Test</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 3. COVERAGE TEST MODE */}
      {activeTestType === 'coverage' && (
        <View style={styles.modeContainer}>
          {/* Quick View Last Result Card if a previous coverage test exists */}
          {coverageResults && (
            <TouchableOpacity
              style={styles.viewResultCard}
              onPress={() => setScreenMode('coverage_result')}
              activeOpacity={0.85}>
              <View style={styles.viewResultLeft}>
                <View style={styles.viewResultIconCircle}>
                  <CoverageTestIcon size={16} color="#00A389" />
                </View>
                <View>
                  <Text style={styles.viewResultTitle}>Latest Coverage Result</Text>
                  <Text style={styles.viewResultSubtitle}>
                    {coverageResults.downMbps != null ? `${coverageResults.downMbps.toFixed(1)} Mbps` : '--'} •{' '}
                    {EXPERIENCE_LABELS[coverageResults.experience]} Experience
                  </Text>
                </View>
              </View>
              <View style={styles.viewResultArrow}>
                <Text style={styles.viewResultDetailsText}>View Details</Text>
                <ChevronRightIcon size={16} color="#00A389" />
              </View>
            </TouchableOpacity>
          )}

          {/* Start Coverage Test Action */}
          <TouchableOpacity
            style={styles.fullWidthActionBtn}
            onPress={() => setScreenMode('coverage_testing')}
            activeOpacity={0.85}>
            <CoverageTestIcon size={18} color="#FFFFFF" />
            <Text style={styles.fullWidthActionBtnText}>Start Coverage Diagnostic Test</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 4. ADVANCE TESTS MODE */}
      {activeTestType === 'advance' && (
        <View style={styles.modeContainer}>
          <View style={styles.sectionHeadingRow}>
            <Text style={styles.sectionHeading}>Advance Diagnostic Modes</Text>
          </View>

          <TouchableOpacity
            style={styles.fullWidthActionBtn}
            onPress={() => setShowAdvanceModal(true)}
            activeOpacity={0.85}>
            <AdvanceTestsIcon size={18} color="#FFFFFF" />
            <Text style={styles.fullWidthActionBtnText}>Run an Advance Test</Text>
          </TouchableOpacity>

          <View style={[styles.detailsCard, styles.advanceCardSpacing]}>
            <TouchableOpacity
              style={styles.detailRow}
              onPress={() => setScreenMode('continuous_setup')}
              activeOpacity={0.7}>
              <View>
                <Text style={styles.advTitle}>Continuous Test</Text>
                <Text style={styles.advSubtitle}>Capture network coverage continuously</Text>
              </View>
              <ChevronRightIcon size={18} color="#64748B" />
            </TouchableOpacity>

            <View style={styles.detailDivider} />

            <TouchableOpacity
              style={styles.detailRow}
              onPress={() => setScreenMode('schedule_setup')}
              activeOpacity={0.7}>
              <View>
                <Text style={styles.advTitle}>Schedule Test</Text>
                <Text style={styles.advSubtitle}>Set it once. The app runs tests automatically</Text>
              </View>
              <ChevronRightIcon size={18} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* Active Schedule Status & Disable Button */}
          {activeSchedule && (
            <View style={styles.activeScheduleDashboardCard}>
              <View style={styles.activeScheduleDashboardLeft}>
                <View style={styles.statusDotLive} />
                <View>
                  <Text style={styles.activeScheduleDashboardTitle}>
                    Scheduled Testing Active ({activeSchedule.frequency.toUpperCase()})
                  </Text>
                  <Text style={styles.activeScheduleDashboardSub}>
                    {describeSchedule(activeSchedule)} • {activeSchedule.fromDate} to {activeSchedule.toDate}
                  </Text>
                  <Text style={styles.activeScheduleDashboardSub}>
                    {scheduleState.isRunning
                      ? 'Running scheduled test now...'
                      : scheduleNextRunAt
                      ? `Next: ${scheduleNextRunAt <= Date.now() ? 'due now' : formatScheduleTime(scheduleNextRunAt)}`
                      : 'Schedule finished'}
                    {scheduleState.lastRunAt
                      ? ` • Last: ${formatScheduleTime(scheduleState.lastRunAt)}`
                      : ''}
                  </Text>
                  {scheduleState.lastOutcome && (
                    <Text style={styles.activeScheduleDashboardSub}>{scheduleState.lastOutcome}</Text>
                  )}
                </View>
              </View>
              <TouchableOpacity
                style={styles.disableSmallBtn}
                onPress={() => {
                  scheduledTestService.clearSchedule();
                  Alert.alert('Schedule Disabled', 'Automated scheduled testing has been disabled.');
                }}
                activeOpacity={0.8}>
                <Text style={styles.disableSmallBtnText}>Disable</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Active Continuous Test Status & Stop Button */}
          {renderContinuousCard()}
        </View>
      )}

      {/* Continuous session keeps running when you leave its screen: show it on every test tab */}
      {activeTestType !== 'advance' && renderContinuousCard()}

      {/* Advance Tests Bottom Sheet Modal (Screenshot 1) */}
      <AdvanceTestModal
        visible={showAdvanceModal}
        onClose={() => setShowAdvanceModal(false)}
        onSelectContinuous={() => {
          setShowAdvanceModal(false);
          setScreenMode('continuous_setup');
        }}
        onSelectSchedule={() => {
          setShowAdvanceModal(false);
          setScreenMode('schedule_setup');
        }}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: '#F4F6FA',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
  },
  gaugeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E8EDF2',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
    marginBottom: 14,
    alignItems: 'center',
  },
  topPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 9,
  },
  networkPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2F6',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  networkPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
  },
  statusDotGreen: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  coveragePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    gap: 5,
  },
  coveragePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },
  startGaugeContainer: {
    marginVertical: 30,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  progressContainer: {
    width: '90%',
    alignItems: 'center',
    marginVertical: 10,
  },
  progressMessage: {
    fontSize: 12,
    color: '#00A389',
    fontWeight: '600',
    marginTop: 6,
  },
  testButtonsGrid: {
    width: '100%',
    marginTop: 18,
    gap: 10,
  },
  testButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  testButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 24,
    gap: 6,
  },
  testButtonActive: {
    backgroundColor: '#F5A623',
    borderWidth: 1.5,
    borderColor: '#F5A623',
    shadowColor: '#F5A623',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  testButtonInactive: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  testButtonText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  testButtonTextActive: {
    color: '#0F172A',
  },
  testButtonTextInactive: {
    color: '#334155',
  },
  modeContainer: {
    marginTop: 2,
    marginBottom: 12,
  },
  viewResultCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E8EDF2',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  viewResultLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  viewResultIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewResultTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  viewResultSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
  },
  viewResultArrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewResultDetailsText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#00A389',
  },
  monitoringControlCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E8EDF2',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  monitoringLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusIndicatorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusDotLive: {
    backgroundColor: '#10B981',
  },
  statusDotOff: {
    backgroundColor: '#94A3B8',
  },
  monitoringTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  monitoringSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  monitoringToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 14,
    gap: 6,
  },
  monitoringStartBtn: {
    backgroundColor: '#00A389',
  },
  monitoringStopBtn: {
    backgroundColor: '#EF4444',
  },
  monitoringBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  sectionHeadingRow: {
    marginBottom: 10,
    marginTop: 4,
    paddingHorizontal: 2,
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
    letterSpacing: -0.2,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -5,
    marginBottom: 10,
  },
  detailsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E8EDF2',
    marginBottom: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
  },
  detailLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 12,
    color: '#0F172A',
    fontWeight: '700',
  },
  detailDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 6,
  },
  fullWidthActionBtn: {
    backgroundColor: '#00A389',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
    marginTop: 6,
    shadowColor: '#00A389',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  fullWidthActionBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  advTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  advSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  advValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#00A389',
  },
  miniToggleBtn: {
    backgroundColor: '#00A389',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
  },
  miniToggleActive: {
    backgroundColor: '#EF4444',
  },
  miniToggleText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 11,
  },
  miniOutlineBtn: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
  },
  miniOutlineBtnText: {
    color: '#0F172A',
    fontWeight: '600',
    fontSize: 11,
  },
  spinnerSpacing: {
    marginBottom: 4,
  },
  signalGoodValue: {
    color: '#10B981',
    fontWeight: '800',
  },
  alignRightCol: {
    alignItems: 'flex-end',
  },
  detailCoordsSubtext: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  advanceCardSpacing: {
    marginTop: 12,
  },
  activeScheduleDashboardCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  activeScheduleDashboardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  activeScheduleDashboardTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  activeScheduleDashboardSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  disableSmallBtn: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  disableSmallBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  nearbyCard: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 14,
    padding: 12,
    marginTop: 10,
  },
  nearbyHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  nearbyTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#166534',
  },
  nearbyRadiusText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#15803D',
  },
  nearbyOpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nearbyOpName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  nearbyOpSpeed: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#00A389',
  },
});
