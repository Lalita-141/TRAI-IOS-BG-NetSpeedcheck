import React, { useEffect, useState } from 'react';
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
  DownloadIcon,
  UploadIcon,
  SignalBarsIcon,
  GlobeIcon,
  CalendarIcon,
  ClockIcon,
  ServerIcon,
  PinIcon,
} from './Icons';
import {
  ContinuousTestSessionResults,
  CycleResult,
} from './ContinuousTestProgressView';
import { ContinuousTestType } from './ContinuousTestSetupView';
import { LocationMiniMap } from './LocationMiniMap';
import { Sample } from '../types';
import { reverseGeocode } from '../services/geocodeService';
import {
  NOT_MEASURED,
  displayCarrier,
  displayRadio,
  displaySignal,
  useTestServerHost,
} from '../utils/sampleDisplay';

const fixed = (v: number | null | undefined, digits: number) =>
  v != null ? v.toFixed(digits) : NOT_MEASURED;

const connectionName = (network: string | null | undefined) => {
  switch (network) {
    case 'wifi':
      return 'Wi-Fi';
    case 'cellular':
      return 'Mobile Data';
    case 'ethernet':
      return 'Ethernet';
    case 'none':
      return 'No Service';
    default:
      return network || NOT_MEASURED;
  }
};

/** Every value one cycle measured, for its card. Only values that test type measures are listed. */
export function cycleValueList(
  sample: Sample,
  testType: ContinuousTestType,
): { label: string; value: string }[] {
  if (testType === 'video_browser') {
    return [
      { label: 'Video Start', value: `${fixed(sample.video_delay_ms, 0)} ms` },
      { label: 'Video Speed', value: `${fixed(sample.down_mbps, 2)} Mbps` },
      { label: 'Page Load', value: `${fixed(sample.page_load_sec, 2)} s` },
      { label: 'TTFB', value: `${fixed(sample.ttfb_ms, 0)} ms` },
      { label: 'Stream', value: sample.streaming_quality ?? NOT_MEASURED },
      { label: 'Signal', value: displaySignal(sample) },
    ];
  }
  const values = [
    { label: 'Latency', value: `${fixed(sample.latency_ms, 0)} ms` },
    { label: 'Jitter', value: `${fixed(sample.jitter_ms, 2)} ms` },
    { label: 'Packet Loss', value: `${fixed(sample.packet_loss_pct, 0)}%` },
    { label: 'Signal', value: displaySignal(sample) },
  ];
  if (testType === 'speed') {
    values.unshift(
      { label: 'Download', value: `${fixed(sample.down_mbps, 2)} Mbps` },
      { label: 'Upload', value: `${fixed(sample.up_mbps, 2)} Mbps` },
    );
  }
  return values;
}

/** Full result of the newest cycle that measured something, laid out like a single test result. */
const LastTestCard: React.FC<{
  sample: Sample;
  testType: ContinuousTestType;
}> = ({ sample, testType }) => {
  const [locationName, setLocationName] = useState('Resolving location...');
  const serverHost = useTestServerHost();

  useEffect(() => {
    let mounted = true;
    reverseGeocode(sample.lat, sample.lng).then(name => {
      if (mounted) setLocationName(name || 'Location Unavailable');
    });
    return () => {
      mounted = false;
    };
  }, [sample.lat, sample.lng]);

  const date = new Date(sample.ts * 1000);
  const isVideo = testType === 'video_browser';
  // Coverage mode measures no download / upload, so those boxes are left out
  const showTopRow = testType !== 'coverage';

  // Top: two headline values; bottom: three supporting values
  const top = isVideo
    ? [
        {
          value: fixed(sample.page_load_sec, 2),
          unit: 's',
          label: 'Page Load Time',
        },
        {
          value: fixed(sample.down_mbps, 2),
          unit: 'Mbps',
          label: 'Video Speed',
        },
      ]
    : [
        {
          value: fixed(sample.down_mbps, 2),
          unit: 'Mbps',
          label: 'Download Speed',
          icon: <DownloadIcon size={14} color="#0284C7" />,
        },
        {
          value: fixed(sample.up_mbps, 2),
          unit: 'Mbps',
          label: 'Upload Speed',
          icon: <UploadIcon size={14} color="#7C3AED" />,
        },
      ];
  const bottom = isVideo
    ? [
        {
          label: 'Video Start',
          value: `${fixed(sample.video_delay_ms, 0)} ms`,
        },
        { label: 'TTFB', value: `${fixed(sample.ttfb_ms, 0)} ms` },
        { label: 'Stream', value: sample.streaming_quality ?? NOT_MEASURED },
      ]
    : [
        { label: 'Latency', value: `${fixed(sample.latency_ms, 0)} ms` },
        {
          label: 'Packet Loss',
          value: `${fixed(sample.packet_loss_pct, 2)} %`,
        },
        { label: 'Jitter', value: `${fixed(sample.jitter_ms, 2)} ms` },
      ];

  const details: { icon: React.ReactNode; label: string; value: string }[] = [
    {
      icon: <CoverageTestIcon size={14} color="#64748B" />,
      label: 'Connection',
      value: connectionName(sample.network),
    },
    {
      icon: <SignalBarsIcon size={14} color="#64748B" />,
      label: 'Tech',
      value: displayRadio(sample),
    },
    {
      icon: <GlobeIcon size={14} color="#64748B" />,
      label: 'Operator',
      value: displayCarrier(sample),
    },
    {
      icon: <CalendarIcon size={14} color="#64748B" />,
      label: 'Date',
      value: date.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
    },
    {
      icon: <ClockIcon size={14} color="#64748B" />,
      label: 'Time',
      value: date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }),
    },
    {
      icon: <Text style={styles.docIcon}>📄</Text>,
      label: 'Test ID',
      value: sample.id ? sample.id.substring(0, 6).toUpperCase() : NOT_MEASURED,
    },
  ];

  return (
    <View>
      <Text style={styles.sectionHeading}>Last Test Result</Text>

      <View style={styles.heroCard}>
        {showTopRow ? (
          <View style={styles.heroTopRow}>
            {top.map((item, i) => (
              <React.Fragment key={item.label}>
                {i > 0 ? <View style={styles.heroVerticalDivider} /> : null}
                <View style={styles.heroSpeedCol}>
                  <View style={styles.heroValueRow}>
                    <Text style={styles.heroNumber}>{item.value}</Text>
                    <Text style={styles.heroUnit}>{item.unit}</Text>
                  </View>
                  <View style={styles.heroLabelRow}>
                    <Text style={styles.heroLabel}>{item.label}</Text>
                    {'icon' in item ? item.icon : null}
                  </View>
                </View>
              </React.Fragment>
            ))}
          </View>
        ) : null}
        {showTopRow ? <View style={styles.heroHorizontalDivider} /> : null}
        <View style={styles.heroBottomRow}>
          {bottom.map((item, i) => (
            <React.Fragment key={item.label}>
              {i > 0 ? <View style={styles.heroMetricDivider} /> : null}
              <View style={styles.heroMetricCol}>
                <Text style={styles.heroMetricLabel}>{item.label}</Text>
                <Text style={styles.heroMetricValue}>{item.value}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>
      </View>

      <View style={styles.detailsCard}>
        <Text style={styles.detailsTitle}>Test Details</Text>
        <View style={styles.detailsDivider} />
        <View style={styles.detailsGrid}>
          {details.map(d => (
            <View key={d.label} style={styles.detailCell}>
              <View style={styles.detailLabelRow}>
                {d.icon}
                <Text style={styles.detailLabel}>{d.label}</Text>
              </View>
              <Text style={styles.detailValue}>{d.value}</Text>
            </View>
          ))}
        </View>
        <View style={styles.detailsDivider} />
        <View style={styles.detailLabelRow}>
          <ServerIcon size={14} color="#64748B" />
          <Text style={styles.detailLabel}>Test Server</Text>
        </View>
        <Text style={styles.detailValue}>{serverHost}</Text>
        <View style={styles.detailsDivider} />
        <View style={styles.detailLabelRow}>
          <CoverageTestIcon size={14} color="#64748B" />
          <Text style={styles.detailLabel}>Signal Strength</Text>
        </View>
        <Text style={styles.detailValue}>{displaySignal(sample)}</Text>
        <View style={styles.detailsDivider} />
        <View style={styles.detailLabelRow}>
          <PinIcon size={14} color="#0284C7" />
          <Text style={styles.detailLabel}>Location</Text>
        </View>
        <Text style={styles.detailValue}>{locationName}</Text>
        <View style={styles.coordsRow}>
          <View style={styles.detailCell}>
            <Text style={styles.detailLabel}>Latitude</Text>
            <Text style={styles.detailValue}>{fixed(sample.lat, 6)}</Text>
          </View>
          <View style={styles.detailCell}>
            <Text style={styles.detailLabel}>Longitude</Text>
            <Text style={styles.detailValue}>{fixed(sample.lng, 6)}</Text>
          </View>
        </View>
        {sample.lat != null && sample.lng != null ? (
          <View style={styles.mapWrap}>
            <LocationMiniMap
              lat={sample.lat}
              lng={sample.lng}
              accuracy={sample.accuracy}
            />
          </View>
        ) : null}
      </View>

      <Text style={styles.lastOnlyNote}>
        * The results shown above are from the last test only and not the
        aggregated value of all tests in this series. The session summary and
        every cycle are listed below.
      </Text>
    </View>
  );
};

interface ContinuousTestResultViewProps {
  results: ContinuousTestSessionResults;
  onBackToHome: () => void;
  onRestartTest: () => void;
}

export const ContinuousTestResultView: React.FC<
  ContinuousTestResultViewProps
> = ({ results, onBackToHome, onRestartTest }) => {
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
  // Cycles are newest first
  const lastSample =
    results.cycles.find((c: CycleResult) => c.sample)?.sample ?? null;

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={onBackToHome}
          activeOpacity={0.7}
        >
          <BackArrowIcon size={22} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Continuous Test Results</Text>
        <View style={styles.headerRightSpacer} />
      </View>
      <View style={styles.headerDivider} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Status Banner */}
        <View style={styles.statusBanner}>
          <View style={styles.statusBannerTop}>
            <View
              style={[
                styles.statusBadge,
                results.stoppedByUser
                  ? styles.badgeStopped
                  : styles.badgeComplete,
              ]}
            >
              <Text
                style={[
                  styles.statusBadgeText,
                  results.stoppedByUser
                    ? styles.badgeStoppedText
                    : styles.badgeCompleteText,
                ]}
              >
                {results.stoppedByUser
                  ? 'STOPPED BY USER'
                  : 'DURATION COMPLETED'}
              </Text>
            </View>

            <View
              style={[
                styles.testTypePill,
                { borderColor: typeInfo.accentColor },
              ]}
            >
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

        {lastSample ? (
          <LastTestCard sample={lastSample} testType={results.testType} />
        ) : null}

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
                    <Text style={styles.cycleNumberPillText}>
                      Cycle #{cycle.cycleNumber}
                    </Text>
                  </View>
                  <Text style={styles.cycleTimeText}>{cycle.timestamp}</Text>
                </View>

                {cycle.failed ? (
                  <Text style={styles.cycleFailedText}>Failed</Text>
                ) : (
                  <View style={styles.cycleSuccessWrap}>
                    <CheckCircleIcon size={16} color="#059669" />
                    <Text style={styles.cycleSuccessText}>Recorded</Text>
                  </View>
                )}
              </View>

              <View style={styles.cycleCardBody}>
                <View style={styles.cycleMetricBlock}>
                  <Text style={styles.cycleBlockLabel}>
                    {cycle.primaryLabel}
                  </Text>
                  <Text
                    style={[
                      styles.cycleBlockVal,
                      { color: typeInfo.accentColor },
                    ]}
                  >
                    {cycle.primaryMetric}
                  </Text>
                </View>

                <View style={styles.cycleMetricBlock}>
                  <Text style={styles.cycleBlockLabel}>
                    {cycle.secondaryLabel}
                  </Text>
                  <Text style={styles.cycleBlockVal}>
                    {cycle.secondaryMetric}
                  </Text>
                </View>

                <View style={styles.cycleMetricBlockRight}>
                  <Text style={styles.cycleBlockLabel}>Extra Info</Text>
                  <Text style={styles.cycleBlockExtra}>{cycle.extraInfo}</Text>
                </View>
              </View>

              {cycle.sample ? (
                <View style={styles.cycleValuesGrid}>
                  {cycleValueList(cycle.sample, results.testType).map(v => (
                    <View key={v.label} style={styles.cycleValueCell}>
                      <Text style={styles.cycleBlockLabel}>{v.label}</Text>
                      <Text style={styles.cycleValueText}>{v.value}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ))}
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={styles.restartBtn}
            onPress={onRestartTest}
            activeOpacity={0.85}
          >
            <RestartIcon size={18} color="#0F172A" />
            <Text style={styles.restartBtnText}>Run Continuous Test Again</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.homeBtn}
            onPress={onBackToHome}
            activeOpacity={0.7}
          >
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
  cycleFailedText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },
  cycleValuesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    rowGap: 8,
  },
  cycleValueCell: {
    width: '33.33%',
  },
  cycleValueText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E8EDF2',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
    marginBottom: 12,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroSpeedCol: {
    flex: 1,
    alignItems: 'center',
  },
  heroValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  heroNumber: {
    fontSize: 30,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  heroUnit: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  heroLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  heroLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  heroVerticalDivider: {
    width: 1,
    height: 44,
    backgroundColor: '#E2E8F0',
  },
  heroHorizontalDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 14,
  },
  heroBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroMetricCol: {
    flex: 1,
    alignItems: 'center',
  },
  heroMetricDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#F1F5F9',
  },
  heroMetricLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 4,
  },
  heroMetricValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    fontVariant: ['tabular-nums'],
  },
  detailsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E8EDF2',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  detailsTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  detailsDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 12,
  },
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 14,
  },
  detailCell: {
    width: '33.33%',
    paddingRight: 6,
  },
  detailLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 3,
  },
  detailLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 1,
  },
  docIcon: {
    fontSize: 11,
  },
  coordsRow: {
    flexDirection: 'row',
    marginTop: 12,
  },
  mapWrap: {
    marginTop: 14,
  },
  lastOnlyNote: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 22,
    lineHeight: 16,
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
