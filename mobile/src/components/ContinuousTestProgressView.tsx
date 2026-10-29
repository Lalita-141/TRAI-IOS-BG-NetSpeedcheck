import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  SafeAreaView,
  ScrollView,
  Animated,
} from 'react-native';
import {
  BackArrowIcon,
  StopIcon,
  SpeedTestIcon,
  CoverageTestIcon,
  VideoBrowserTestIcon,
  HourglassIcon,
  StopwatchIcon,
} from './Icons';
import { ContinuousTestConfig, ContinuousTestType } from './ContinuousTestSetupView';
import { MonitorStatus } from '../services/monitorService';
import {
  continuousTestService,
  useContinuousSession,
} from '../services/continuousTestService';

export interface CycleResult {
  cycleNumber: number;
  timestamp: string;
  primaryMetric: string;
  primaryLabel: string;
  secondaryMetric: string;
  secondaryLabel: string;
  extraInfo: string;
  numericVal: number;
  failed?: boolean;
  // Raw measured values used for the session summary
  details?: {
    upMbps?: number | null;
    latencyMs?: number | null;
    videoDelayMs?: number | null;
    videoMbps?: number | null;
    carrier?: string | null;
    radio?: string | null;
  };
}

export interface ContinuousTestSessionResults {
  testType: ContinuousTestType;
  durationMinsPlanned: number;
  totalSecondsElapsed: number;
  totalCyclesCompleted: number;
  stoppedByUser: boolean;
  cycles: CycleResult[];
  summary: {
    stat1Label: string;
    stat1Value: string;
    stat2Label: string;
    stat2Value: string;
    stat3Label: string;
    stat3Value: string;
    stat4Label: string;
    stat4Value: string;
  };
}

interface ContinuousTestProgressViewProps {
  config: ContinuousTestConfig;
  status: MonitorStatus;
  onStop: (results: ContinuousTestSessionResults) => void;
  onComplete: (results: ContinuousTestSessionResults) => void;
  onMinimize?: () => void;
}

export const ContinuousTestProgressView: React.FC<ContinuousTestProgressViewProps> = ({
  config,
  onStop,
  onComplete,
  onMinimize,
}) => {
  // Session runs in continuousTestService, so it survives tab switches,
  // screen-off and app backgrounding. This screen only renders its state.
  const session = useContinuousSession();
  const [now, setNow] = useState(Date.now());
  const reportedRef = useRef(false);
  const mountedSessionStartRef = useRef(session.startedAt);

  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulse animation for the active testing ring
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.08,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  // UI clock: elapsed / remaining / gap countdown are derived from service timestamps
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Session ended (duration completed) while this screen is open
  useEffect(() => {
    if (reportedRef.current || session.active || !session.lastResults) return;
    if (session.startedAt !== mountedSessionStartRef.current) return;
    reportedRef.current = true;
    if (session.lastResults.stoppedByUser) {
      onStop(session.lastResults);
    } else {
      onComplete(session.lastResults);
    }
  }, [session.active, session.lastResults, session.startedAt, onStop, onComplete]);

  const totalPlannedSeconds = Math.max(10, config.durationMins * 60);
  const clock = session.active ? now : session.finishedAt ?? now;
  const startedAt = session.startedAt ?? clock;
  const endsAt = session.endsAt ?? clock;
  const elapsedSeconds = Math.min(
    totalPlannedSeconds,
    Math.max(0, Math.floor((clock - startedAt) / 1000))
  );
  const secondsRemaining = Math.max(0, Math.ceil((endsAt - clock) / 1000));
  const currentCycle = Math.max(1, session.currentCycle);
  const phase: 'testing' | 'waiting' | 'gap' =
    session.phase === 'gap' ? 'gap' : session.phase === 'waiting' ? 'waiting' : 'testing';
  const gapRemaining = session.gapEndsAt
    ? Math.max(0, Math.ceil((session.gapEndsAt - now) / 1000))
    : config.gapSeconds;
  const completedCycles = session.cycles;
  const livePrimary = session.livePrimary;
  const liveSecondary = session.liveSecondary;
  const liveProgress = session.liveProgress;

  const handleManualStop = async () => {
    if (reportedRef.current) return;
    reportedRef.current = true;
    const res = await continuousTestService.stop();
    if (res) {
      onStop(res);
    }
  };

  // Back arrow leaves the screen; the session keeps running in the background
  const handleBack = () => {
    if (onMinimize) {
      onMinimize();
    } else {
      handleManualStop();
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getTestTypeInfo = () => {
    switch (config.testType) {
      case 'speed':
        return {
          title: 'Speed Test Running',
          icon: <SpeedTestIcon size={18} color="#0F172A" />,
          accentColor: '#F5A623',
          badgeText: 'CONTINUOUS SPEED TEST',
        };
      case 'coverage':
        return {
          title: 'Coverage Test Running',
          icon: <CoverageTestIcon size={18} color="#0F172A" />,
          accentColor: '#10B981',
          badgeText: 'CONTINUOUS COVERAGE TEST',
        };
      case 'video_browser':
        return {
          title: 'Video & Browser Test Running',
          icon: <VideoBrowserTestIcon size={18} color="#0F172A" />,
          accentColor: '#818CF8',
          badgeText: 'CONTINUOUS VIDEO & BROWSER',
        };
    }
  };

  const testInfo = getTestTypeInfo();

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack} activeOpacity={0.7}>
          <BackArrowIcon size={22} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Continuous Testing</Text>
        <TouchableOpacity style={styles.headerStopBadge} onPress={handleManualStop}>
          <Text style={styles.headerStopText}>Stop</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.headerDivider} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {/* Test Type Badge Banner */}
        <View style={styles.testBadgeRow}>
          <View style={[styles.testTypeIconBox, { backgroundColor: testInfo.accentColor }]}>
            {testInfo.icon}
          </View>
          <View style={styles.testBadgeTextWrap}>
            <Text style={styles.badgeCategoryText}>{testInfo.badgeText}</Text>
            <Text style={styles.badgeSubText}>
              Interval: {config.gapSeconds}s gap • Duration: {config.durationMins} mins
            </Text>
          </View>
          <View style={styles.livePulseDot} />
        </View>

        {/* Live Active Cycle Card */}
        <View style={styles.liveCycleCard}>
          <View style={styles.cycleHeaderRow}>
            <View style={styles.cycleBadge}>
              <Text style={styles.cycleBadgeText}>CYCLE #{currentCycle}</Text>
            </View>
            <View style={styles.phaseIndicator}>
              <Text
                style={[
                  styles.phaseText,
                  phase === 'testing' ? styles.phaseTesting : styles.phaseGap,
                ]}>
                {phase === 'testing'
                  ? '● RUNNING TEST'
                  : phase === 'waiting'
                  ? '⏸ QUEUED'
                  : `⏳ GAP WAITING (${gapRemaining}s)`}
              </Text>
            </View>
          </View>

          {/* Large Metric Gauge / Progress Display */}
          <View style={styles.metricGaugeContainer}>
            <Animated.View
              style={[
                styles.metricCircleRing,
                phase === 'testing' && { transform: [{ scale: pulseAnim }] },
                styles.metricCircleRingBase,
              ]}>
              <Text style={[styles.livePrimaryNumber, { color: testInfo.accentColor }]}>
                {phase === 'gap' ? `${gapRemaining}s` : livePrimary}
              </Text>
              <Text style={styles.livePrimaryLabel}>
                {phase === 'gap'
                  ? 'Next Cycle In'
                  : config.testType === 'speed'
                  ? 'Current Speed'
                  : config.testType === 'coverage'
                  ? 'Network'
                  : 'Load Time'}
              </Text>
            </Animated.View>
          </View>

          {/* Subtext info */}
          <Text style={styles.liveSecondaryText}>
            {phase === 'gap' ? `Cooling interval before Cycle #${currentCycle + 1}` : liveSecondary}
          </Text>

          {/* Progress Bar */}
          <View style={styles.progressBarTrack}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${phase !== 'gap' ? liveProgress : Math.min(100, Math.max(0, Math.round(((config.gapSeconds - gapRemaining) / config.gapSeconds) * 100)))}%`,
                  backgroundColor: testInfo.accentColor,
                },
              ]}
            />
          </View>

          {/* Dual Timers Row */}
          <View style={styles.timersRow}>
            <View style={styles.timerItem}>
              <View style={styles.timerIconWrap}>
                <StopwatchIcon size={14} color="#64748B" />
              </View>
              <View>
                <Text style={styles.timerLabel}>Elapsed</Text>
                <Text style={styles.timerValue}>{formatTime(elapsedSeconds)}</Text>
              </View>
            </View>

            <View style={styles.timerDivider} />

            <View style={styles.timerItem}>
              <View style={styles.timerIconWrap}>
                <HourglassIcon size={14} color="#D97706" />
              </View>
              <View>
                <Text style={styles.timerLabel}>Remaining</Text>
                <Text style={[styles.timerValue, styles.timerValueRemaining]}>
                  {formatTime(secondsRemaining)}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Live Completed Cycles History */}
        <View style={styles.historySection}>
          <View style={styles.historySectionHeader}>
            <Text style={styles.historyTitle}>
              Completed Cycles ({completedCycles.length})
            </Text>
            <Text style={styles.historySubtitle}>Live test log</Text>
          </View>

          {completedCycles.length === 0 ? (
            <View style={styles.emptyCyclesBox}>
              <Text style={styles.emptyCyclesText}>
                Running initial cycle... Results will appear here shortly.
              </Text>
            </View>
          ) : (
            completedCycles.map((cycle, idx) => (
              <View key={`${cycle.cycleNumber}-${idx}`} style={styles.cycleItemCard}>
                <View style={styles.cycleItemLeft}>
                  <View style={styles.cycleNumberCircle}>
                    <Text style={styles.cycleNumberText}>#{cycle.cycleNumber}</Text>
                  </View>
                  <View>
                    <Text style={styles.cycleTimestamp}>{cycle.timestamp}</Text>
                    <Text style={styles.cycleExtraInfo}>{cycle.extraInfo}</Text>
                  </View>
                </View>

                <View style={styles.cycleItemRight}>
                  <Text style={styles.cyclePrimaryVal}>{cycle.primaryMetric}</Text>
                  <Text style={styles.cycleSecondaryVal}>{cycle.secondaryMetric}</Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Floating Stop Continuous Test Button */}
      <View style={styles.floatingStopWrapper}>
        <TouchableOpacity
          style={styles.stopTestBtn}
          onPress={handleManualStop}
          activeOpacity={0.85}>
          <StopIcon size={18} color="#FFFFFF" />
          <Text style={styles.stopTestBtnText}>Stop Continuous Test</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F4F6FA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 14,
  },
  backBtn: {
    padding: 6,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  headerStopBadge: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
  },
  headerStopText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#EF4444',
  },
  headerDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 110,
  },
  testBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8EDF2',
    borderRadius: 16,
    padding: 12,
    marginBottom: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  testTypeIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  testBadgeTextWrap: {
    flex: 1,
  },
  badgeCategoryText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.5,
  },
  badgeSubText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
  },
  livePulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
    marginLeft: 8,
  },
  liveCycleCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8EDF2',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  cycleHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    alignItems: 'center',
    marginBottom: 16,
  },
  cycleBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  cycleBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#D97706',
    letterSpacing: 0.5,
  },
  phaseIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  phaseText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  phaseTesting: {
    color: '#059669',
  },
  phaseGap: {
    color: '#D97706',
  },
  metricGaugeContainer: {
    marginVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricCircleRing: {
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricCircleRingBase: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  livePrimaryNumber: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  livePrimaryLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  liveSecondaryText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    marginTop: 6,
    marginBottom: 14,
  },
  progressBarTrack: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
    marginBottom: 18,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  timersRow: {
    flexDirection: 'row',
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  timerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timerIconWrap: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  timerLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  timerValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 1,
  },
  timerValueRemaining: {
    color: '#D97706',
  },
  timerDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E2E8F0',
  },
  historySection: {
    marginBottom: 20,
  },
  historySectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 12,
  },
  historyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  historySubtitle: {
    fontSize: 12,
    color: '#64748B',
  },
  emptyCyclesBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    alignItems: 'center',
  },
  emptyCyclesText: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
  },
  cycleItemCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8EDF2',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  cycleItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cycleNumberCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cycleNumberText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#D97706',
  },
  cycleTimestamp: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  cycleExtraInfo: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
  },
  cycleItemRight: {
    alignItems: 'flex-end',
  },
  cyclePrimaryVal: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  cycleSecondaryVal: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
    marginTop: 2,
  },
  floatingStopWrapper: {
    position: 'absolute',
    bottom: 34,
    left: 16,
    right: 16,
    zIndex: 9999,
    elevation: 12,
  },
  stopTestBtn: {
    backgroundColor: '#EF4444',
    borderRadius: 28,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  stopTestBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
});
