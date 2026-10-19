import React from 'react';
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
  CheckCircleIcon,
  RestartIcon,
  SpeedTestIcon,
  CoverageTestIcon,
  VideoBrowserTestIcon,
} from './Icons';
import { ContinuousTestSessionResults } from './ContinuousTestProgressView';

interface ContinuousTestResultViewProps {
  results: ContinuousTestSessionResults;
  onBackToHome: () => void;
  onRestartTest: () => void;
}

export const ContinuousTestResultView: React.FC<ContinuousTestResultViewProps> = ({
  results,
  onBackToHome,
  onRestartTest,
}) => {
  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    if (m === 0) return `${s}s`;
    return `${m}m ${s}s`;
  };

  const getTestTypeInfo = () => {
    switch (results.testType) {
      case 'speed':
        return {
          name: 'Speed Test',
          icon: <SpeedTestIcon size={18} color="#0F172A" />,
          accentColor: '#F5A623',
        };
      case 'coverage':
        return {
          name: 'Coverage Test',
          icon: <CoverageTestIcon size={18} color="#0F172A" />,
          accentColor: '#10B981',
        };
      case 'video_browser':
        return {
          name: 'Video & Browser Test',
          icon: <VideoBrowserTestIcon size={18} color="#0F172A" />,
          accentColor: '#818CF8',
        };
    }
  };

  const typeInfo = getTestTypeInfo();

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBackToHome} activeOpacity={0.7}>
          <BackArrowIcon size={22} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Continuous Test Results</Text>
        <View style={styles.headerRightSpacer} />
      </View>
      <View style={styles.headerDivider} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {/* Status Banner */}
        <View style={styles.statusBanner}>
          <View style={styles.statusBannerTop}>
            <View
              style={[
                styles.statusBadge,
                results.stoppedByUser ? styles.badgeStopped : styles.badgeComplete,
              ]}>
              <Text
                style={[
                  styles.statusBadgeText,
                  results.stoppedByUser ? styles.badgeStoppedText : styles.badgeCompleteText,
                ]}>
                {results.stoppedByUser ? 'STOPPED BY USER' : 'DURATION COMPLETED'}
              </Text>
            </View>

            <View style={[styles.testTypePill, { borderColor: typeInfo.accentColor }]}>
              {typeInfo.icon}
              <Text style={styles.testTypePillText}>{typeInfo.name}</Text>
            </View>
          </View>

          <Text style={styles.statusHeadline}>
            Completed {results.totalCyclesCompleted}{' '}
            {results.totalCyclesCompleted === 1 ? 'Cycle' : 'Cycles'}
          </Text>
          <Text style={styles.statusSubtext}>
            Ran for {formatDuration(results.totalSecondsElapsed)} (Planned:{' '}
            {results.durationMinsPlanned} mins)
          </Text>
        </View>

        {/* Aggregate Summary Metrics (2x2 Grid) */}
        <Text style={styles.sectionHeading}>Session Aggregate Summary</Text>
        <View style={styles.metricsGrid}>
          {/* Card 1 */}
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>{results.summary.stat1Label}</Text>
            <Text style={[styles.metricValue, { color: typeInfo.accentColor }]}>
              {results.summary.stat1Value}
            </Text>
          </View>

          {/* Card 2 */}
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>{results.summary.stat2Label}</Text>
            <Text style={styles.metricValue}>{results.summary.stat2Value}</Text>
          </View>

          {/* Card 3 */}
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>{results.summary.stat3Label}</Text>
            <Text style={styles.metricValue}>{results.summary.stat3Value}</Text>
          </View>

          {/* Card 4 */}
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>{results.summary.stat4Label}</Text>
            <Text style={[styles.metricValue, { color: '#059669' }]}>
              {results.summary.stat4Value}
            </Text>
          </View>
        </View>

        {/* Detailed Cycles Breakdown */}
        <Text style={[styles.sectionHeading, styles.cyclesHeadingSpacing]}>
          Cycles Breakdown ({results.cycles.length})
        </Text>

        <View style={styles.cyclesList}>
          {results.cycles.map(cycle => (
            <View key={cycle.cycleNumber} style={styles.cycleCard}>
              <View style={styles.cycleCardHeader}>
                <View style={styles.cycleBadgeWrap}>
                  <View style={styles.cycleNumberPill}>
                    <Text style={styles.cycleNumberPillText}>Cycle #{cycle.cycleNumber}</Text>
                  </View>
                  <Text style={styles.cycleTimeText}>{cycle.timestamp}</Text>
                </View>

                <View style={styles.cycleSuccessWrap}>
                  <CheckCircleIcon size={16} color="#059669" />
                  <Text style={styles.cycleSuccessText}>Recorded</Text>
                </View>
              </View>

              <View style={styles.cycleCardBody}>
                <View style={styles.cycleMetricBlock}>
                  <Text style={styles.cycleBlockLabel}>{cycle.primaryLabel}</Text>
                  <Text style={[styles.cycleBlockVal, { color: typeInfo.accentColor }]}>
                    {cycle.primaryMetric}
                  </Text>
                </View>

                <View style={styles.cycleMetricBlock}>
                  <Text style={styles.cycleBlockLabel}>{cycle.secondaryLabel}</Text>
                  <Text style={styles.cycleBlockVal}>{cycle.secondaryMetric}</Text>
                </View>

                <View style={styles.cycleMetricBlockRight}>
                  <Text style={styles.cycleBlockLabel}>Extra Info</Text>
                  <Text style={styles.cycleBlockExtra}>{cycle.extraInfo}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={styles.restartBtn}
            onPress={onRestartTest}
            activeOpacity={0.85}>
            <RestartIcon size={18} color="#0F172A" />
            <Text style={styles.restartBtnText}>Run Continuous Test Again</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.homeBtn}
            onPress={onBackToHome}
            activeOpacity={0.7}>
            <Text style={styles.homeBtnText}>Back to Dashboard</Text>
          </TouchableOpacity>
        </View>
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
    paddingTop: 16,
    paddingBottom: 40,
  },
  statusBanner: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8EDF2',
    borderRadius: 20,
    padding: 18,
    marginBottom: 22,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  statusBannerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  badgeComplete: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  badgeCompleteText: {
    color: '#059669',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  badgeStopped: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  badgeStoppedText: {
    color: '#D97706',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  testTypePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F5A623',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  testTypePillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F172A',
  },
  statusHeadline: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  statusSubtext: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 4,
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 12,
  },
  cyclesHeadingSpacing: {
    marginTop: 22,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricCard: {
    width: '48.5%',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8EDF2',
    borderRadius: 16,
    padding: 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  metricValue: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 6,
    letterSpacing: -0.2,
  },
  cyclesList: {
    gap: 10,
  },
  cycleCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8EDF2',
    borderRadius: 16,
    padding: 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  cycleCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 10,
    marginBottom: 10,
  },
  cycleBadgeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cycleNumberPill: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  cycleNumberPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#D97706',
  },
  cycleTimeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  cycleSuccessWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cycleSuccessText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  cycleCardBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  cycleMetricBlock: {
    flex: 1,
  },
  cycleMetricBlockRight: {
    flex: 1.2,
    alignItems: 'flex-end',
  },
  cycleBlockLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  cycleBlockVal: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  cycleBlockExtra: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
    textAlign: 'right',
  },
  actionsContainer: {
    marginTop: 28,
    gap: 12,
  },
  restartBtn: {
    backgroundColor: '#F5A623',
    borderRadius: 28,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#F5A623',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  restartBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  homeBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 28,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#334155',
  },
});
