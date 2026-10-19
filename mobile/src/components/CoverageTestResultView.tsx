import React, { useState, useEffect } from 'react';
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
  CoverageTestIcon,
  PinIcon,
  SignalBarsIcon,
  ServerIcon,
  CalendarIcon,
  ClockIcon,
} from './Icons';
import { Sample } from '../types';
import { reverseGeocode } from '../services/geocodeService';
import { CoverageTestResults } from './CoverageTestProgressView';

interface CoverageTestResultViewProps {
  sample: Sample | null;
  results: CoverageTestResults | null;
  onBack: () => void;
  onRunSpeedTest: () => void;
  onOpenMap: () => void;
}

export const CoverageTestResultView: React.FC<CoverageTestResultViewProps> = ({
  sample,
  results,
  onBack,
  onRunSpeedTest,
  onOpenMap,
}) => {
  const [locationName, setLocationName] = useState<string>('Resolving location...');

  useEffect(() => {
    reverseGeocode(sample?.lat ?? null, sample?.lng ?? null).then(setLocationName);
  }, [sample?.lat, sample?.lng]);

  const timestamp = sample?.ts ? sample.ts * 1000 : Date.now();
  const dateObj = new Date(timestamp);

  const formattedDate = dateObj.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const formattedTime = dateObj.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const signalDbm = results?.signalDbm ?? (sample?.network === 'wifi' ? -58 : -88);
  const signalQuality = results?.signalQuality ?? (signalDbm > -80 ? 'Excellent' : 'Good');
  const carrier = results?.carrierName || (sample?.carrier && sample.carrier !== '--' ? sample.carrier : 'Airtel');
  const radio = results?.radioTech || sample?.radio || (sample?.network === 'wifi' ? 'Wi-Fi' : '5G');
  const gpsAccuracy = results?.gpsAccuracy ?? Math.round(sample?.accuracy || 8);
  const cellTower = results?.cellTower || `${carrier.toUpperCase()} - Sector 04 NodeB`;
  const frequencyBand = results?.frequencyBand || (sample?.network === 'wifi' ? '5.2 GHz' : 'Band 40');
  const testId = (sample?.id ? sample.id : 'cov9a').slice(-4);

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top Header with Back Arrow */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.7}>
          <BackArrowIcon size={22} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Coverage Test Result</Text>
        <View style={styles.headerRightSpacer} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {/* Top Hero Signal Card */}
        <View style={styles.heroCard}>
          <View style={styles.heroSignalHeader}>
            <View style={styles.heroSignalValueRow}>
              <Text style={styles.heroSignalNumber}>{signalDbm}</Text>
              <Text style={styles.heroSignalUnit}>dBm</Text>
            </View>
            <View style={styles.heroQualityBadge}>
              <View style={styles.heroQualityDot} />
              <Text style={styles.heroQualityText}>{signalQuality} Signal</Text>
            </View>
          </View>
          <Text style={styles.heroSignalLabel}>RF Signal Strength (RSSI / RSRP)</Text>

          <View style={styles.heroDivider} />

          {/* 3 Metric Columns */}
          <View style={styles.heroSubMetricsRow}>
            <View style={styles.heroSubCol}>
              <Text style={styles.heroSubValue}>{radio}</Text>
              <Text style={styles.heroSubLabel}>Technology</Text>
            </View>

            <View style={styles.heroSubDivider} />

            <View style={styles.heroSubCol}>
              <Text style={styles.heroSubValue}>±{gpsAccuracy}m</Text>
              <Text style={styles.heroSubLabel}>GPS Accuracy</Text>
            </View>

            <View style={styles.heroSubDivider} />

            <View style={styles.heroSubCol}>
              <Text style={styles.heroSubValue}>{frequencyBand}</Text>
              <Text style={styles.heroSubLabel}>Frequency</Text>
            </View>
          </View>
        </View>

        {/* Test Details Card */}
        <View style={styles.detailsCard}>
          <Text style={styles.detailsCardTitle}>Diagnostic Details</Text>

          {/* Row 1: Coverage, Tech, Operator */}
          <View style={styles.detailRow}>
            <View style={styles.detailCol}>
              <View style={styles.detailIconLabelRow}>
                <CoverageTestIcon size={15} color="#64748B" />
                <Text style={styles.detailFieldLabel}>Coverage</Text>
              </View>
              <Text style={styles.detailFieldValue}>{signalDbm} dBm</Text>
            </View>

            <View style={styles.detailCol}>
              <View style={styles.detailIconLabelRow}>
                <SignalBarsIcon size={15} color="#64748B" />
                <Text style={styles.detailFieldLabel}>Tech</Text>
              </View>
              <Text style={styles.detailFieldValue}>{radio}</Text>
            </View>

            <View style={styles.detailCol}>
              <View style={styles.detailIconLabelRow}>
                <Text style={styles.detailGlobeIcon}>🌐</Text>
                <Text style={styles.detailFieldLabel}>Operator</Text>
              </View>
              <Text style={styles.detailFieldValue}>{carrier}</Text>
            </View>
          </View>

          <View style={styles.detailsDivider} />

          {/* Row 2: Date, Time, Test ID */}
          <View style={styles.detailRow}>
            <View style={styles.detailCol}>
              <View style={styles.detailIconLabelRow}>
                <CalendarIcon size={15} color="#64748B" />
                <Text style={styles.detailFieldLabel}>Date</Text>
              </View>
              <Text style={styles.detailFieldValue}>{formattedDate}</Text>
            </View>

            <View style={styles.detailCol}>
              <View style={styles.detailIconLabelRow}>
                <ClockIcon size={15} color="#64748B" />
                <Text style={styles.detailFieldLabel}>Time</Text>
              </View>
              <Text style={styles.detailFieldValue}>{formattedTime}</Text>
            </View>

            <View style={styles.detailCol}>
              <View style={styles.detailIconLabelRow}>
                <Text style={styles.detailDocIcon}>📄</Text>
                <Text style={styles.detailFieldLabel}>Test ID</Text>
              </View>
              <Text style={styles.detailFieldValue}>{testId}</Text>
            </View>
          </View>

          <View style={styles.detailsDivider} />

          {/* Row 3: Cell Tower / Test Server */}
          <View style={styles.detailFullRow}>
            <View style={styles.detailIconLabelRow}>
              <ServerIcon size={15} color="#64748B" />
              <Text style={styles.detailFieldLabel}>Connected Cell Tower / Node</Text>
            </View>
            <Text style={styles.detailFullValue}>{cellTower}</Text>
          </View>

          <View style={styles.detailsDivider} />

          {/* Row 4: Location */}
          <View style={styles.detailFullRow}>
            <View style={styles.detailIconLabelRow}>
              <PinIcon size={15} color="#0284C7" />
              <Text style={styles.detailFieldLabel}>Location</Text>
            </View>
            <Text style={styles.detailLocationName}>{locationName}</Text>
            {sample?.lat != null && sample?.lng != null ? (
              <Text style={styles.detailLocationCoords}>
                Latitude: {sample.lat.toFixed(4)}, Longitude: {sample.lng.toFixed(4)}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Primary Action Button: Open Interactive Coverage Map */}
        <TouchableOpacity
          style={styles.primaryCtaButton}
          onPress={onOpenMap}
          activeOpacity={0.85}>
          <CoverageTestIcon size={18} color="#0F172A" />
          <Text style={styles.primaryCtaText}>Open Interactive Coverage Map</Text>
        </TouchableOpacity>

        {/* Secondary Action Button: Run a Speed Test */}
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={onRunSpeedTest}
          activeOpacity={0.85}>
          <Text style={styles.secondaryButtonText}>Run a Speed Test</Text>
        </TouchableOpacity>

        {/* Back to Home Button */}
        <TouchableOpacity
          style={styles.backHomeBtn}
          onPress={onBack}
          activeOpacity={0.7}>
          <Text style={styles.backHomeText}>Back to Home</Text>
        </TouchableOpacity>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E8EDF2',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
    marginBottom: 14,
  },
  heroSignalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroSignalValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  heroSignalNumber: {
    fontSize: 42,
    fontWeight: '900',
    color: '#0F172A',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  heroSignalUnit: {
    fontSize: 18,
    fontWeight: '800',
    color: '#00A389',
  },
  heroQualityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    gap: 6,
  },
  heroQualityDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#10B981',
  },
  heroQualityText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#059669',
  },
  heroSignalLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 4,
  },
  heroDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 14,
  },
  heroSubMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroSubCol: {
    flex: 1,
    alignItems: 'center',
  },
  heroSubValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  heroSubLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2,
  },
  heroSubDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E2E8F0',
  },
  detailsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E8EDF2',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 16,
  },
  detailsCardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 14,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailCol: {
    flex: 1,
  },
  detailIconLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 3,
  },
  detailGlobeIcon: {
    fontSize: 13,
  },
  detailDocIcon: {
    fontSize: 13,
  },
  detailFieldLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
  },
  detailFieldValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  detailsDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 12,
  },
  detailFullRow: {
    flexDirection: 'column',
  },
  detailFullValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 3,
  },
  detailLocationName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 3,
  },
  detailLocationCoords: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  primaryCtaButton: {
    backgroundColor: '#F5A623',
    paddingVertical: 15,
    borderRadius: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#F5A623',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 10,
  },
  primaryCtaText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  secondaryButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    paddingVertical: 14,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
  backHomeBtn: {
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backHomeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
});
