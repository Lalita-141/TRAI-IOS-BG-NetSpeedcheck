import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  SafeAreaView,
  Animated,
  Easing,
} from 'react-native';
import {
  BackArrowIcon,
  CoverageTestIcon,
  SignalBarsIcon,
  PinIcon,
} from './Icons';
import { MonitorStatus } from '../services/monitorService';
import { locationService } from '../services/locationService';
import { testCoordinator } from '../services/testCoordinator';
import { measureCoverage } from '../services/coverageSurvey';
import { getConfig } from '../config';
import { ExperienceCategory, EXPERIENCE_LABELS } from '../config/coverageThresholds';

/**
 * Result of one Network Experience Coverage measurement. Every value here is
 * measured; RF fields (signalDbm, cellTower, frequencyBand) stay null because
 * no public API used by this app reads modem RF values.
 */
export interface CoverageTestResults {
  experience: ExperienceCategory;
  network: string;
  radioTech: string | null;
  carrierName: string | null;
  downMbps: number | null;
  latencyMs: number | null;
  jitterMs: number | null;
  packetLossPct: number | null;
  lat: number | null;
  lng: number | null;
  gpsAccuracy: number | null;
  failureReason: string | null;
  signalDbm: number | null;
  cellTower: string | null;
  frequencyBand: string | null;
}

interface CoverageTestProgressViewProps {
  status: MonitorStatus;
  onCancel: () => void;
  onComplete: (results: CoverageTestResults) => void;
}

export const CoverageTestProgressView: React.FC<CoverageTestProgressViewProps> = ({
  onCancel,
  onComplete,
}) => {
  const [phase, setPhase] = useState<'network' | 'gps' | 'done'>('network');
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [downMbps, setDownMbps] = useState<number | null>(null);
  const [radioTech, setRadioTech] = useState<string | null>(null);
  const [carrierName, setCarrierName] = useState<string | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [statusText, setStatusText] = useState('Reading network state');

  // Pulse animation for radar rings
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 1800,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      })
    ).start();
  }, [pulseAnim]);

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    let isMounted = true;

    const runSequence = async () => {
      const appConfig = await getConfig();
      const m = await testCoordinator.run('manual', () =>
        measureCoverage({
          serverUrl: appConfig.serverUrl,
          getLocation: () => locationService.getCurrentLocation(),
          onProgress: p => {
            if (!isMounted) return;
            if (p.stage === 'network') {
              if (p.radio !== undefined) setRadioTech(p.radio);
              if (p.carrier !== undefined) setCarrierName(p.carrier);
            } else if (p.stage === 'latency') {
              setStatusText('Measuring latency');
              if (p.latencyMs !== undefined) setLatencyMs(p.latencyMs);
            } else if (p.stage === 'throughput') {
              setStatusText('Measuring throughput');
              if (p.downMbps !== undefined) setDownMbps(p.downMbps);
            } else {
              setPhase('gps');
              setStatusText('Resolving GPS location');
              if (p.location) {
                setGpsAccuracy(
                  p.location.accuracy != null ? Math.round(p.location.accuracy) : null
                );
              }
            }
          },
        })
      );
      if (!isMounted) return;

      const results: CoverageTestResults = {
        experience: m.experience,
        network: m.network,
        radioTech: m.radio,
        carrierName: m.carrier,
        downMbps: m.downMbps,
        latencyMs: m.latencyMs,
        jitterMs: m.jitterMs,
        packetLossPct: m.packetLossPct,
        lat: m.location.lat,
        lng: m.location.lng,
        gpsAccuracy: m.location.accuracy != null ? Math.round(m.location.accuracy) : null,
        failureReason: m.failureReason,
        signalDbm: null,
        cellTower: null,
        frequencyBand: null,
      };
      setPhase('done');
      setStatusText(EXPERIENCE_LABELS[results.experience]);
      onCompleteRef.current(results);
    };

    runSequence().catch(err => {
      console.warn('Coverage measurement failed:', err);
      if (isMounted) setStatusText('Measurement failed');
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const pulseScale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.8, 1.4],
  });

  const pulseOpacity = pulseAnim.interpolate({
    inputRange: [0, 0.7, 1],
    outputRange: [0.6, 0.2, 0],
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top Header with Back Arrow */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onCancel} activeOpacity={0.7}>
          <BackArrowIcon size={22} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Network Experience Test</Text>
        <View style={styles.headerRightSpacer} />
      </View>

      {/* Stepper Bar: Network -> GPS */}
      <View style={styles.stepperContainer}>
        <View style={styles.stepperLineTrack}>
          <View
            style={[
              styles.stepperLineFill,
              phase === 'gps' || phase === 'done' ? styles.stepperLineActive : null,
            ]}
          />
        </View>

        {/* Step 1: Network performance */}
        <View style={styles.stepItem}>
          <View
            style={[
              styles.stepCircle,
              phase === 'network' ? styles.stepCircleActive : styles.stepCircleDone,
            ]}>
            <SignalBarsIcon size={20} color="#0F172A" />
          </View>
          <Text style={styles.stepLabel}>Network</Text>
          <Text style={styles.stepValue}>
            {latencyMs != null ? `${latencyMs} ms` : phase === 'network' ? 'Measuring...' : '--'}
          </Text>
        </View>

        {/* Step 2: GPS */}
        <View style={styles.stepItem}>
          <View
            style={[
              styles.stepCircle,
              phase === 'gps'
                ? styles.stepCircleActive
                : phase === 'done'
                ? styles.stepCircleDone
                : styles.stepCirclePending,
            ]}>
            <PinIcon
              size={20}
              color={phase === 'gps' || phase === 'done' ? '#0F172A' : '#94A3B8'}
            />
          </View>
          <Text style={styles.stepLabel}>GPS</Text>
          <Text style={styles.stepValue}>
            {gpsAccuracy != null ? `±${gpsAccuracy} m` : phase === 'gps' ? 'Resolving...' : '--'}
          </Text>
        </View>
      </View>

      {/* Center Measurement Card */}
      <View style={styles.radarCard}>
        <View style={styles.radarTopBar}>
          <View style={styles.qualityPill}>
            <View style={styles.qualityDot} />
            <Text style={styles.qualityText}>{statusText}</Text>
          </View>
          <Text style={styles.radarSubText}>{radioTech ?? '--'}</Text>
        </View>

        <View style={styles.radarCenterVisual}>
          <Animated.View
            style={[
              styles.pulsingRing,
              {
                transform: [{ scale: pulseScale }],
                opacity: pulseOpacity,
              },
            ]}
          />
          <View style={styles.radarInnerCircle}>
            <CoverageTestIcon size={34} color="#00A389" />
            <Text style={styles.radarDbmValue}>{downMbps != null ? downMbps.toFixed(1) : '--'}</Text>
            <Text style={styles.radarDbmUnit}>Mbps</Text>
          </View>
        </View>

        <View style={styles.signalStatusBadge}>
          <Text style={styles.signalStatusText}>NETWORK EXPERIENCE · NOT RF SIGNAL</Text>
        </View>

        <View style={styles.radarScrubberTrack}>
          <View
            style={[
              styles.radarScrubberFill,
              phase === 'network'
                ? styles.scrubberRf
                : phase === 'gps'
                ? styles.scrubberGps
                : styles.scrubberDone,
            ]}
          />
        </View>
      </View>

      {/* Live Details Card */}
      <View style={styles.detailsCard}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Network Carrier</Text>
          <Text style={styles.detailValue}>{carrierName ?? 'Unknown'}</Text>
        </View>
        <View style={styles.detailDivider} />
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Radio Access Tech</Text>
          <Text style={styles.detailValue}>{radioTech ?? '--'}</Text>
        </View>
        <View style={styles.detailDivider} />
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>GPS Accuracy</Text>
          <Text style={styles.detailValue}>{gpsAccuracy != null ? `±${gpsAccuracy} m` : '--'}</Text>
        </View>
        <View style={styles.detailDivider} />
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Current Status</Text>
          <Text style={[styles.detailValue, styles.statusAccent]}>{statusText}</Text>
        </View>
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
  headerRightSpacer: {
    width: 36,
  },
  stepperContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 24,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E8EDF2',
    position: 'relative',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  stepperLineTrack: {
    position: 'absolute',
    top: 36,
    left: '30%',
    right: '30%',
    height: 3,
    backgroundColor: '#F1F5F9',
    borderRadius: 1.5,
    zIndex: 0,
  },
  stepperLineFill: {
    height: '100%',
    width: '0%',
    backgroundColor: '#00A389',
    borderRadius: 1.5,
  },
  stepperLineActive: {
    width: '100%',
  },
  stepItem: {
    alignItems: 'center',
    zIndex: 1,
  },
  stepCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  stepCircleActive: {
    backgroundColor: '#00A389',
    shadowColor: '#00A389',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  stepCircleDone: {
    backgroundColor: '#CCFBF1',
    borderWidth: 1.5,
    borderColor: '#00A389',
  },
  stepCirclePending: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  stepLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  stepValue: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  radarCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E8EDF2',
    height: 250,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    justifyContent: 'space-between',
  },
  radarTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  qualityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 5,
  },
  qualityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  qualityText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  radarSubText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  radarCenterVisual: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    height: 130,
  },
  pulsingRing: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: '#10B981',
  },
  radarInnerCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00A389',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  radarDbmValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 2,
  },
  radarDbmUnit: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
    marginTop: -2,
  },
  signalStatusBadge: {
    alignSelf: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 10,
    marginBottom: 10,
  },
  signalStatusText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 0.8,
  },
  radarScrubberTrack: {
    height: 4,
    width: '100%',
    backgroundColor: '#F1F5F9',
  },
  radarScrubberFill: {
    height: '100%',
    backgroundColor: '#00A389',
  },
  scrubberRf: {
    width: '50%',
  },
  scrubberGps: {
    width: '85%',
  },
  scrubberDone: {
    width: '100%',
  },
  detailsCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E8EDF2',
    paddingHorizontal: 18,
    paddingVertical: 14,
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
    paddingVertical: 8,
  },
  detailLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  statusAccent: {
    color: '#00A389',
  },
  detailDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
  },
});
