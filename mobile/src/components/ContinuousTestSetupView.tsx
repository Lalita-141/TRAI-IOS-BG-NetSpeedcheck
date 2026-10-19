import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import {
  BackArrowIcon,
  HourglassIcon,
  StopwatchIcon,
  RocketIcon,
  StopIcon,
} from './Icons';

export type ContinuousTestType = 'coverage' | 'speed' | 'video_browser';

export interface ContinuousTestConfig {
  testType: ContinuousTestType;
  gapSeconds: number;
  durationMins: number;
}

interface ContinuousTestSetupViewProps {
  isRunning?: boolean;
  activeConfig?: ContinuousTestConfig | null;
  onBack: () => void;
  onStartTest: (config: ContinuousTestConfig) => void;
  onStopTest?: () => void;
}

export const ContinuousTestSetupView: React.FC<ContinuousTestSetupViewProps> = ({
  isRunning = false,
  activeConfig = null,
  onBack,
  onStartTest,
  onStopTest,
}) => {
  const [testType, setTestType] = useState<ContinuousTestType>(
    activeConfig?.testType || 'coverage'
  );
  const [gapSeconds, setGapSeconds] = useState<number>(
    activeConfig?.gapSeconds || 5
  );
  const [durationMins, setDurationMins] = useState<number>(
    activeConfig?.durationMins || 10
  );

  const handleDecreaseGap = () => {
    setGapSeconds(prev => Math.max(5, prev - 5));
  };

  const handleIncreaseGap = () => {
    setGapSeconds(prev => Math.min(60, prev + 5));
  };

  const handleDecreaseDuration = () => {
    setDurationMins(prev => Math.max(5, prev - 5));
  };

  const handleIncreaseDuration = () => {
    setDurationMins(prev => Math.min(120, prev + 5));
  };

  const handleStart = () => {
    onStartTest({
      testType,
      gapSeconds,
      durationMins,
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.7}>
          <BackArrowIcon size={22} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Setting up Continuous Test</Text>
        <View style={styles.headerRightSpacer} />
      </View>
      <View style={styles.headerDivider} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {/* Section 1: Select a Test Type */}
        <Text style={styles.sectionHeading}>Select a Test Type :</Text>

        <View style={styles.pillsRow}>
          {/* Coverage Pill */}
          <TouchableOpacity
            style={[
              styles.testPill,
              testType === 'coverage' ? styles.testPillActive : styles.testPillInactive,
            ]}
            onPress={() => setTestType('coverage')}
            activeOpacity={0.8}>
            <Text
              style={[
                styles.testPillText,
                testType === 'coverage' ? styles.testPillTextActive : styles.testPillTextInactive,
              ]}>
              Coverage
            </Text>
            <View
              style={[
                styles.radioIndicator,
                testType === 'coverage' ? styles.radioActive : styles.radioInactive,
              ]}
            />
          </TouchableOpacity>

          {/* Speed Test Pill */}
          <TouchableOpacity
            style={[
              styles.testPill,
              testType === 'speed' ? styles.testPillActive : styles.testPillInactive,
            ]}
            onPress={() => setTestType('speed')}
            activeOpacity={0.8}>
            <Text
              style={[
                styles.testPillText,
                testType === 'speed' ? styles.testPillTextActive : styles.testPillTextInactive,
              ]}>
              Speed Test
            </Text>
            <View
              style={[
                styles.radioIndicator,
                testType === 'speed' ? styles.radioActive : styles.radioInactive,
              ]}
            />
          </TouchableOpacity>

          {/* Video & Browser Pill */}
          <TouchableOpacity
            style={[
              styles.testPill,
              testType === 'video_browser' ? styles.testPillActive : styles.testPillInactive,
            ]}
            onPress={() => setTestType('video_browser')}
            activeOpacity={0.8}>
            <Text
              style={[
                styles.testPillText,
                testType === 'video_browser' ? styles.testPillTextActive : styles.testPillTextInactive,
              ]}
              numberOfLines={1}>
              Video and...
            </Text>
            <View
              style={[
                styles.radioIndicator,
                testType === 'video_browser' ? styles.radioActive : styles.radioInactive,
              ]}
            />
          </TouchableOpacity>
        </View>

        {/* Section 2: Setup Test */}
        <Text style={[styles.sectionHeading, styles.setupHeadingSpacing]}>
          Setup Test:
        </Text>

        {/* Card 1: Gap Between Tests */}
        <View style={styles.setupCard}>
          <View style={styles.cardLeft}>
            <View style={[styles.iconCircle, styles.hourglassCircle]}>
              <HourglassIcon size={18} color="#F5A623" />
            </View>
            <Text style={styles.cardLabel}>Gap Between Tests</Text>
          </View>

          <View style={styles.cardRight}>
            <View style={styles.valueRow}>
              <Text style={styles.valueNumber}>{gapSeconds}</Text>
              <Text style={styles.valueUnit}>s</Text>
            </View>

            <View style={styles.stepperContainer}>
              <TouchableOpacity
                style={styles.stepperBtn}
                onPress={handleDecreaseGap}
                activeOpacity={0.6}>
                <Text style={styles.stepperText}>−</Text>
              </TouchableOpacity>
              <View style={styles.stepperDivider} />
              <TouchableOpacity
                style={styles.stepperBtn}
                onPress={handleIncreaseGap}
                activeOpacity={0.6}>
                <Text style={styles.stepperText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Card 2: Maximum duration */}
        <View style={styles.setupCard}>
          <View style={styles.cardLeft}>
            <View style={[styles.iconCircle, styles.stopwatchCircle]}>
              <StopwatchIcon size={18} color="#00A389" />
            </View>
            <Text style={styles.cardLabel}>Maximum duration</Text>
          </View>

          <View style={styles.cardRight}>
            <View style={styles.valueRow}>
              <Text style={styles.valueNumber}>{durationMins}</Text>
              <Text style={styles.valueUnit}>mins</Text>
            </View>

            <View style={styles.stepperContainer}>
              <TouchableOpacity
                style={styles.stepperBtn}
                onPress={handleDecreaseDuration}
                activeOpacity={0.6}>
                <Text style={styles.stepperText}>−</Text>
              </TouchableOpacity>
              <View style={styles.stepperDivider} />
              <TouchableOpacity
                style={styles.stepperBtn}
                onPress={handleIncreaseDuration}
                activeOpacity={0.6}>
                <Text style={styles.stepperText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Section 3: Action Buttons */}
        {isRunning ? (
          <View style={styles.actionContainer}>
            <View style={styles.activeContinuousBox}>
              <View style={styles.activeBadgeRow}>
                <View style={styles.activeDot} />
                <Text style={styles.activeBadgeText}>CONTINUOUS TESTING ACTIVE</Text>
              </View>
              <Text style={styles.activeContinuousDetails}>
                Running {testType.toUpperCase()} tests every {gapSeconds}s (max {durationMins} mins)
              </Text>
            </View>

            <TouchableOpacity
              style={styles.stopBtn}
              onPress={onStopTest}
              activeOpacity={0.85}>
              <StopIcon size={18} color="#FFFFFF" />
              <Text style={styles.stopBtnText}>Stop Continuous Test</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.startBtn}
            onPress={handleStart}
            activeOpacity={0.85}>
            <RocketIcon size={20} color="#0F172A" />
            <Text style={styles.startBtnText}>Start Test</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
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
  headerRightSpacer: {
    width: 36,
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
    paddingTop: 20,
    paddingBottom: 36,
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 14,
  },
  setupHeadingSpacing: {
    marginTop: 24,
  },
  pillsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  testPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  testPillActive: {
    borderWidth: 2,
    borderColor: '#F5A623',
    backgroundColor: '#FFFDF7',
  },
  testPillInactive: {
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  testPillText: {
    fontSize: 12.5,
    flexShrink: 1,
  },
  testPillTextActive: {
    fontWeight: '800',
    color: '#0F172A',
  },
  testPillTextInactive: {
    fontWeight: '600',
    color: '#64748B',
  },
  radioIndicator: {
    width: 18,
    height: 18,
    borderRadius: 9,
    marginLeft: 4,
  },
  radioActive: {
    backgroundColor: '#F5A623',
  },
  radioInactive: {
    borderWidth: 2,
    borderColor: '#CBD5E1',
    backgroundColor: 'transparent',
  },
  setupCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8EDF2',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hourglassCircle: {
    backgroundColor: '#FEF3C7',
  },
  stopwatchCircle: {
    backgroundColor: '#E6F7F5',
  },
  cardLabel: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
    flexShrink: 1,
  },
  cardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
    minWidth: 46,
    justifyContent: 'flex-end',
  },
  valueNumber: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
  },
  valueUnit: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#F8FAFC',
  },
  stepperBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  stepperDivider: {
    width: 1,
    height: '100%',
    backgroundColor: '#CBD5E1',
  },
  startBtn: {
    backgroundColor: '#F5A623',
    borderRadius: 28,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 36,
    gap: 8,
    shadowColor: '#F5A623',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  startBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  actionContainer: {
    marginTop: 28,
  },
  activeContinuousBox: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#10B981',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  activeBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  activeBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#10B981',
    letterSpacing: 0.8,
  },
  activeContinuousDetails: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 18,
    fontWeight: '500',
  },
  stopBtn: {
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
    elevation: 4,
  },
  stopBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
