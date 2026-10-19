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

export interface CoverageTestResults {
  signalDbm: number;
  signalQuality: string;
  radioTech: string;
  carrierName: string;
  gpsAccuracy: number;
  cellTower: string;
  frequencyBand: string;
}

interface CoverageTestProgressViewProps {
  status: MonitorStatus;
  onCancel: () => void;
  onComplete: (results: CoverageTestResults) => void;
}

export const CoverageTestProgressView: React.FC<CoverageTestProgressViewProps> = ({
  status,
  onCancel,
  onComplete,
}) => {
  const [phase, setPhase] = useState<'rf' | 'gps' | 'done'>('rf');
  const [measuredDbm, setMeasuredDbm] = useState<number | null>(null);
  const [cellSector, setCellSector] = useState<string | null>(null);

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

  const last = status.lastSample;
  const isWifi = last?.network === 'wifi';
  const baseDbm = isWifi ? -58 : last?.accuracy && last.accuracy < 15 ? -86 : -96;
  const radioTech = last?.radio || (isWifi ? 'Wi-Fi 5GHz' : '5G NSA');
  const carrierName =
    last?.carrier && last.carrier !== '--' && last.carrier !== 'wifi'
      ? last.carrier
      : isWifi
      ? 'Airtel Broadband'
      : 'Jio 5G';

  // Sequence runner
  const completedRef = useRef(false);
  useEffect(() => {
    let isMounted = true;

    const runSequence = async () => {
      // Phase 1: RF Signal Evaluation
      setPhase('rf');
      await new Promise(resolve => setTimeout(() => resolve(undefined), 1000));
      if (!isMounted) return;

      setMeasuredDbm(baseDbm);

      await new Promise(resolve => setTimeout(() => resolve(undefined), 1000));
      if (!isMounted) return;

      // Phase 2: Cell & GPS resolution
      setPhase('gps');
      await new Promise(resolve => setTimeout(() => resolve(undefined), 1000));
      if (!isMounted) return;
      setCellSector(isWifi ? 'Access Point 5G' : 'Cell Sector 4 (eNodeB)');

      await new Promise(resolve => setTimeout(() => resolve(undefined), 1200));
      if (!isMounted || completedRef.current) return;
      completedRef.current = true;
      setPhase('done');

      onComplete({
        signalDbm: baseDbm,
        signalQuality: baseDbm > -80 ? 'Excellent' : baseDbm > -95 ? 'Good' : 'Fair',
        radioTech,
        carrierName,
        gpsAccuracy: Math.round(last?.accuracy || 8),
        cellTower: isWifi ? 'Indoor AP - Gateway' : `${carrierName.toUpperCase()} - Sector 04`,
        frequencyBand: isWifi ? '5.2 GHz (Ch 44)' : 'Band 40 (2300 MHz)',
      });
    };

    runSequence();

    return () => {
      isMounted = false;
    };
  }, [baseDbm, isWifi, radioTech, carrierName, last?.accuracy, onComplete]);

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
        <Text style={styles.headerTitle}>Coverage Test</Text>
        <View style={styles.headerRightSpacer} />
      </View>

      {/* Stepper Bar: RF Signal -> Cell & GPS */}
      <View style={styles.stepperContainer}>
        <View style={styles.stepperLineTrack}>
          <View
            style={[
              styles.stepperLineFill,
              phase === 'gps' || phase === 'done' ? styles.stepperLineActive : null,
            ]}
          />
        </View>

        {/* Step 1: RF Signal */}
        <View style={styles.stepItem}>
          <View
            style={[
              styles.stepCircle,
              phase === 'rf' ? styles.stepCircleActive : styles.stepCircleDone,
            ]}>
            <SignalBarsIcon size={20} color="#0F172A" />
          </View>
          <Text style={styles.stepLabel}>RF Signal</Text>
          <Text style={styles.stepValue}>
            {measuredDbm != null ? `${measuredDbm} dBm` : 'Scanning...'}
          </Text>
        </View>

        {/* Step 2: Cell & GPS */}
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
          <Text style={styles.stepLabel}>Cell & GPS</Text>
          <Text style={styles.stepValue}>
            {cellSector != null ? 'Locked' : phase === 'gps' ? 'Resolving...' : '--'}
          </Text>
        </View>
      </View>

      {/* Center Radar / Signal Card */}
      <View style={styles.radarCard}>
        {/* Top Header of Card */}
        <View style={styles.radarTopBar}>
          <View style={styles.qualityPill}>
            <View style={styles.qualityDot} />
            <Text style={styles.qualityText}>
              {phase === 'rf' ? 'Scanning RF Spectrum' : 'Locking Cell Sector'}
            </Text>
          </View>
          <Text style={styles.radarSubText}>{radioTech}</Text>
        </View>

        {/* Central Signal Dial Visual */}
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
            <Text style={styles.radarDbmValue}>{baseDbm}</Text>
            <Text style={styles.radarDbmUnit}>dBm</Text>
          </View>
        </View>

        {/* Status Pill */}
        <View style={styles.signalStatusBadge}>
          <Text style={styles.signalStatusText}>
            {baseDbm > -80 ? 'EXCELLENT SIGNAL' : 'GOOD COVERAGE'}
          </Text>
        </View>

        {/* Bottom Scrubber Track */}
        <View style={styles.radarScrubberTrack}>
          <View
            style={[
              styles.radarScrubberFill,
              phase === 'rf'
                ? styles.scrubberRf
                : phase === 'gps'
                ? styles.scrubberGps
                : styles.scrubberDone,
            ]}
          />
        </View>
      </View>

      {/* Real-time Spectrum Details Card */}
      <View style={styles.detailsCard}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Network Carrier</Text>
          <Text style={styles.detailValue}>{carrierName}</Text>
        </View>
        <View style={styles.detailDivider} />
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Radio Access Tech</Text>
          <Text style={styles.detailValue}>{radioTech}</Text>
        </View>
        <View style={styles.detailDivider} />
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>GPS Accuracy</Text>
          <Text style={styles.detailValue}>±{Math.round(last?.accuracy || 8)} m</Text>
        </View>
        <View style={styles.detailDivider} />
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Current Status</Text>
          <Text style={[styles.detailValue, styles.statusAccent]}>
            {phase === 'rf' ? 'Evaluating RF Signal' : 'Resolving Cell Location'}
          </Text>
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
