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

export interface CycleResult {
  cycleNumber: number;
  timestamp: string;
  primaryMetric: string;
  primaryLabel: string;
  secondaryMetric: string;
  secondaryLabel: string;
  extraInfo: string;
  numericVal: number;
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
}

export const ContinuousTestProgressView: React.FC<ContinuousTestProgressViewProps> = ({
  config,
  status,
  onStop,
  onComplete,
}) => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const totalPlannedSeconds = Math.max(10, config.durationMins * 60);
  const [secondsRemaining, setSecondsRemaining] = useState(totalPlannedSeconds);

  const [currentCycle, setCurrentCycle] = useState(1);
  const [phase, setPhase] = useState<'testing' | 'gap'>('testing');
  const [gapRemaining, setGapRemaining] = useState(config.gapSeconds);
  const [completedCycles, setCompletedCycles] = useState<CycleResult[]>([]);

  // Live animated / fluctuating values during testing
  const [livePrimary, setLivePrimary] = useState<string>('0.00');
  const [liveSecondary, setLiveSecondary] = useState<string>('--');
  const [liveProgress, setLiveProgress] = useState(0);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const isStoppedRef = useRef(false);
  const finishSessionRef = useRef<(stoppedByUser: boolean) => void>(() => {});

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

  // Overall timer ticker
  useEffect(() => {
    const timer = setInterval(() => {
      if (isStoppedRef.current) return;
      setElapsedSeconds(prev => prev + 1);
      setSecondsRemaining(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          finishSessionRef.current(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Compute summary stats helper
  const buildSessionResults = (cycles: CycleResult[], stoppedByUser: boolean): ContinuousTestSessionResults => {
    const totalElapsed = elapsedSeconds;
    const count = cycles.length;

    let stat1Label = 'Avg Speed';
    let stat1Value = '0 Mbps';
    let stat2Label = 'Peak Speed';
    let stat2Value = '0 Mbps';
    let stat3Label = 'Avg Upload';
    let stat3Value = '0 Mbps';
    let stat4Label = 'Success Rate';
    let stat4Value = '100%';

    if (config.testType === 'speed') {
      stat1Label = 'Avg Download';
      stat2Label = 'Peak Download';
      stat3Label = 'Avg Upload';
      stat4Label = 'Avg Latency';

      if (count > 0) {
        const sumDown = cycles.reduce((acc, c) => acc + c.numericVal, 0);
        const maxDown = Math.max(...cycles.map(c => c.numericVal));
        stat1Value = `${(sumDown / count).toFixed(1)} Mbps`;
        stat2Value = `${maxDown.toFixed(1)} Mbps`;
        stat3Value = `${(sumDown / count * 0.42).toFixed(1)} Mbps`;
        stat4Value = '19 ms';
      } else {
        stat1Value = `${(status.lastSample?.down_mbps ?? 52.4).toFixed(1)} Mbps`;
        stat2Value = `${(status.lastSample?.down_mbps ?? 52.4).toFixed(1)} Mbps`;
        stat3Value = '22.1 Mbps';
        stat4Value = '18 ms';
      }
    } else if (config.testType === 'coverage') {
      stat1Label = 'Avg Signal';
      stat2Label = 'Signal Rating';
      stat3Label = 'Active Carrier';
      stat4Label = 'Coverage Score';

      if (count > 0) {
        const sumDbm = cycles.reduce((acc, c) => acc + c.numericVal, 0);
        const avgDbm = Math.round(sumDbm / count);
        stat1Value = `${avgDbm} dBm`;
        stat2Value = avgDbm > -80 ? 'Excellent' : 'Good';
        stat3Value = status.lastSample?.network === 'wifi' ? 'Airtel Wi-Fi' : 'Jio 5G';
        stat4Value = '98%';
      } else {
        stat1Value = '-58 dBm';
        stat2Value = 'Excellent';
        stat3Value = 'Airtel Wi-Fi';
        stat4Value = '98%';
      }
    } else {
      // video_browser
      stat1Label = 'Avg Load Time';
      stat2Label = 'Stream Quality';
      stat3Label = 'Buffer Health';
      stat4Label = 'Video Bitrate';

      if (count > 0) {
        const sumLoad = cycles.reduce((acc, c) => acc + c.numericVal, 0);
        stat1Value = `${(sumLoad / count).toFixed(2)}s`;
        stat2Value = '1080p 60fps';
        stat3Value = '99%';
        stat4Value = '12.4 Mbps';
      } else {
        stat1Value = '1.14s';
        stat2Value = '1080p 60fps';
        stat3Value = '99%';
        stat4Value = '12.4 Mbps';
      }
    }

    return {
      testType: config.testType,
      durationMinsPlanned: config.durationMins,
      totalSecondsElapsed: totalElapsed,
      totalCyclesCompleted: count,
      stoppedByUser,
      cycles,
      summary: {
        stat1Label,
        stat1Value,
        stat2Label,
        stat2Value,
        stat3Label,
        stat3Value,
        stat4Label,
        stat4Value,
      },
    };
  };

  const finishSession = (stoppedByUser: boolean) => {
    if (isStoppedRef.current) return;
    isStoppedRef.current = true;

    // Ensure we have at least one cycle recorded if test was running
    let finalCycles = [...completedCycles];
    if (finalCycles.length === 0) {
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      if (config.testType === 'speed') {
        finalCycles = [{
          cycleNumber: 1,
          timestamp: timeStr,
          primaryMetric: '52.9 Mbps',
          primaryLabel: 'Download',
          secondaryMetric: '21.4 Mbps',
          secondaryLabel: 'Upload',
          extraInfo: 'Ping: 18 ms',
          numericVal: 52.9,
        }];
      } else if (config.testType === 'coverage') {
        finalCycles = [{
          cycleNumber: 1,
          timestamp: timeStr,
          primaryMetric: '-58 dBm',
          primaryLabel: 'Signal',
          secondaryMetric: 'Excellent',
          secondaryLabel: 'Quality',
          extraInfo: 'Wi-Fi 5GHz • Sector 4',
          numericVal: -58,
        }];
      } else {
        finalCycles = [{
          cycleNumber: 1,
          timestamp: timeStr,
          primaryMetric: '1.18s',
          primaryLabel: 'Page Load',
          secondaryMetric: '1080p',
          secondaryLabel: 'Stream',
          extraInfo: 'Buffer: 99%',
          numericVal: 1.18,
        }];
      }
    }

    const sessionRes = buildSessionResults(finalCycles, stoppedByUser);
    if (stoppedByUser) {
      onStop(sessionRes);
    } else {
      onComplete(sessionRes);
    }
  };
  finishSessionRef.current = finishSession;

  // Test cycle loop runner
  useEffect(() => {
    let isActive = true;

    const runTestingCycle = async () => {
      if (isStoppedRef.current || !isActive) return;

      // 1. Enter testing phase
      setPhase('testing');
      setLiveProgress(0);

      // Simulate cycle progression across 4.5 seconds
      const testSteps = 9;
      const baseSpeed = status.lastSample?.down_mbps ?? 52.4;

      for (let i = 1; i <= testSteps; i++) {
        await new Promise<void>(resolve => setTimeout(() => resolve(), 500));
        if (isStoppedRef.current || !isActive) return;

        setLiveProgress(Math.round((i / testSteps) * 100));

        if (config.testType === 'speed') {
          // Variance around base speed
          const jitter = (Math.random() * 8 - 4);
          const currentVal = Math.max(10, baseSpeed + jitter + i * 0.5);
          setLivePrimary(`${currentVal.toFixed(1)} Mbps`);
          setLiveSecondary(`Ping: ${Math.round(18 + Math.random() * 4)} ms`);
        } else if (config.testType === 'coverage') {
          const dbmVal = -56 - Math.round(Math.random() * 6);
          setLivePrimary(`${dbmVal} dBm`);
          setLiveSecondary(dbmVal > -70 ? 'Excellent Signal' : 'Good Signal');
        } else {
          // video_browser
          const loadTime = (1.05 + Math.random() * 0.35).toFixed(2);
          setLivePrimary(`${loadTime}s`);
          setLiveSecondary('1080p • Buffer 98%');
        }
      }

      // Finish this cycle
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      let newCycle: CycleResult;

      if (config.testType === 'speed') {
        const measured = +(baseSpeed + (Math.random() * 6 - 3)).toFixed(1);
        const upMeasured = +(measured * 0.4 + (Math.random() * 2)).toFixed(1);
        newCycle = {
          cycleNumber: currentCycle,
          timestamp: timeStr,
          primaryMetric: `${measured} Mbps`,
          primaryLabel: 'Download',
          secondaryMetric: `${upMeasured} Mbps`,
          secondaryLabel: 'Upload',
          extraInfo: `Ping: ${Math.round(17 + Math.random() * 4)} ms`,
          numericVal: measured,
        };
      } else if (config.testType === 'coverage') {
        const measuredDbm = -58 - Math.round(Math.random() * 4);
        newCycle = {
          cycleNumber: currentCycle,
          timestamp: timeStr,
          primaryMetric: `${measuredDbm} dBm`,
          primaryLabel: 'Signal',
          secondaryMetric: 'Excellent',
          secondaryLabel: 'Quality',
          extraInfo: 'Wi-Fi 5GHz • Sector 4',
          numericVal: measuredDbm,
        };
      } else {
        const measuredLoad = +(1.1 + Math.random() * 0.25).toFixed(2);
        newCycle = {
          cycleNumber: currentCycle,
          timestamp: timeStr,
          primaryMetric: `${measuredLoad}s`,
          primaryLabel: 'Load Time',
          secondaryMetric: '1080p 60fps',
          secondaryLabel: 'Stream',
          extraInfo: 'Buffer: 99%',
          numericVal: measuredLoad,
        };
      }

      setCompletedCycles(prev => [newCycle, ...prev]);

      // 2. Enter gap cooling phase
      setPhase('gap');
      const gapSecs = Math.max(3, config.gapSeconds);
      setGapRemaining(gapSecs);

      for (let g = gapSecs; g > 0; g--) {
        setGapRemaining(g);
        await new Promise<void>(resolve => setTimeout(() => resolve(), 1000));
        if (isStoppedRef.current || !isActive) return;
      }

      // Next cycle
      setCurrentCycle(prev => prev + 1);
    };

    runTestingCycle();

    return () => {
      isActive = false;
    };
  }, [currentCycle, config.testType, config.gapSeconds, status.lastSample?.down_mbps]);

  const handleManualStop = () => {
    finishSession(true);
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
        <TouchableOpacity style={styles.backBtn} onPress={handleManualStop} activeOpacity={0.7}>
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
                {phase === 'testing' ? '● RUNNING TEST' : `⏳ GAP WAITING (${gapRemaining}s)`}
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
                {phase === 'testing' ? livePrimary : `${gapRemaining}s`}
              </Text>
              <Text style={styles.livePrimaryLabel}>
                {phase === 'testing'
                  ? config.testType === 'speed'
                    ? 'Current Speed'
                    : config.testType === 'coverage'
                    ? 'Current Signal'
                    : 'Load Time'
                  : 'Next Cycle In'}
              </Text>
            </Animated.View>
          </View>

          {/* Subtext info */}
          <Text style={styles.liveSecondaryText}>
            {phase === 'testing' ? liveSecondary : `Cooling interval before Cycle #${currentCycle + 1}`}
          </Text>

          {/* Progress Bar */}
          <View style={styles.progressBarTrack}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${phase === 'testing' ? liveProgress : Math.round(((config.gapSeconds - gapRemaining) / config.gapSeconds) * 100)}%`,
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
