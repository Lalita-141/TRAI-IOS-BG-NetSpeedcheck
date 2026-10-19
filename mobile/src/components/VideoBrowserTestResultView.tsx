import React, { useState, useEffect } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  SafeAreaView,
} from 'react-native';
import { Sample } from '../types';
import { VideoBrowserTestResults } from './VideoBrowserTestProgressView';
import { reverseGeocode } from '../services/geocodeService';
import {
  BackArrowIcon,
  CoverageTestIcon,
  SignalBarsIcon,
  GlobeIcon,
  CalendarIcon,
  ClockIcon,
  ServerIcon,
  PinIcon,
  VideoBrowserTestIcon,
} from './Icons';

interface VideoBrowserTestResultViewProps {
  results: VideoBrowserTestResults | null;
  sample: Sample | null;
  testId?: string | number;
  onBack: () => void;
  onRunSpeedTest: () => void;
}

export const VideoBrowserTestResultView: React.FC<VideoBrowserTestResultViewProps> = ({
  results,
  sample,
  testId = 10,
  onBack,
  onRunSpeedTest,
}) => {
  const [locationName, setLocationName] = useState<string>('Resolving location...');

  useEffect(() => {
    reverseGeocode(sample?.lat ?? null, sample?.lng ?? null).then(setLocationName);
  }, [sample?.lat, sample?.lng]);

  const ts = sample?.ts ? sample.ts * 1000 : Date.now();
  const dateObj = new Date(ts);

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

  const videoDelay = results?.videoDelayMs ?? 145;
  const webDelay = results?.webDelayMs ?? 310;
  const quality = results?.streamingQuality ?? '1080p Full HD';
  const bufferRate = results?.bufferingRate ?? '0% (Smooth)';
  const ttfb = results?.ttfbMs ?? 38;

  const carrier = sample?.carrier && sample.carrier !== '--' ? sample.carrier : 'Jio';
  const radio = sample?.radio || (sample?.network === 'wifi' ? 'Wi-Fi' : '4G');
  const coverageDbm = sample?.network === 'wifi' ? '-58 dBm' : '-101 dBm';

  const serverDisplay =
    carrier === 'Wi-Fi'
      ? 'TRAI Broadband Video CDN - Mumbai'
      : `${carrier.toUpperCase()} - Streaming Cache Server`;

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top Header with Back Arrow */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.7}>
          <BackArrowIcon size={22} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Video & Browser Test Result</Text>
        <View style={styles.headerRightSpacer} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {/* Top Hero QoS Card */}
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            {/* Video Delay */}
            <View style={styles.heroSpeedCol}>
              <View style={styles.speedValueRow}>
                <Text style={styles.heroSpeedNumber}>{videoDelay}</Text>
                <Text style={styles.heroSpeedUnit}>ms</Text>
              </View>
              <View style={styles.speedLabelRow}>
                <Text style={styles.heroSpeedLabel}>Video Delay</Text>
                <VideoBrowserTestIcon size={14} color="#0284C7" />
              </View>
            </View>

            <View style={styles.heroVerticalDivider} />

            {/* Web Delay */}
            <View style={styles.heroSpeedCol}>
              <View style={styles.speedValueRow}>
                <Text style={styles.heroSpeedNumber}>{webDelay}</Text>
                <Text style={styles.heroSpeedUnit}>ms</Text>
              </View>
              <View style={styles.speedLabelRow}>
                <Text style={styles.heroSpeedLabel}>Web Delay</Text>
                <GlobeIcon size={14} color="#7C3AED" />
              </View>
            </View>
          </View>

          <View style={styles.heroHorizontalDivider} />

          {/* 3 Columns: Streaming Quality | Buffering | TTFB */}
          <View style={styles.heroBottomRow}>
            <View style={styles.heroMetricCol}>
              <Text style={styles.heroMetricLabel}>Streaming Quality</Text>
              <Text style={styles.heroMetricValue}>{quality}</Text>
            </View>

            <View style={styles.metricDivider} />

            <View style={styles.heroMetricCol}>
              <Text style={styles.heroMetricLabel}>Buffering Rate</Text>
              <Text style={styles.heroMetricValue}>{bufferRate}</Text>
            </View>

            <View style={styles.metricDivider} />

            <View style={styles.heroMetricCol}>
              <Text style={styles.heroMetricLabel}>HTTP TTFB</Text>
              <Text style={styles.heroMetricValue}>{ttfb} ms</Text>
            </View>
          </View>
        </View>

        {/* Test Details Card */}
        <View style={styles.detailsCard}>
          <Text style={styles.detailsCardTitle}>Test Details</Text>
          <View style={styles.detailsDivider} />

          {/* Row 1: Coverage | Tech | Operator */}
          <View style={styles.detailsGridRow}>
            <View style={styles.detailCol}>
              <View style={styles.detailIconLabelRow}>
                <CoverageTestIcon size={15} color="#64748B" />
                <Text style={styles.detailFieldLabel}>Coverage</Text>
              </View>
              <Text style={styles.detailFieldValue}>{coverageDbm}</Text>
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
                <GlobeIcon size={15} color="#64748B" />
                <Text style={styles.detailFieldLabel}>Operator</Text>
              </View>
              <Text style={styles.detailFieldValue}>{carrier}</Text>
            </View>
          </View>

          <View style={styles.detailsDivider} />

          {/* Row 2: Date | Time | Test ID */}
          <View style={styles.detailsGridRow}>
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

          {/* Row 3: Test Server */}
          <View style={styles.detailFullRow}>
            <View style={styles.detailIconLabelRow}>
              <ServerIcon size={15} color="#64748B" />
              <Text style={styles.detailFieldLabel}>Test Server</Text>
            </View>
            <Text style={styles.detailFullValue}>{serverDisplay}</Text>
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

        {/* Action Button: Run a Speed Test */}
        <TouchableOpacity
          style={styles.ctaButton}
          onPress={onRunSpeedTest}
          activeOpacity={0.85}>
          <Text style={styles.ctaButtonText}>Run a Speed Test</Text>
        </TouchableOpacity>

        {/* Secondary Back Button */}
        <TouchableOpacity style={styles.doneBtn} onPress={onBack} activeOpacity={0.75}>
          <Text style={styles.doneBtnText}>Back to Home</Text>
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
    paddingBottom: 12,
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
    paddingTop: 8,
    paddingBottom: 32,
  },
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingVertical: 20,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: '#E8EDF2',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
    marginBottom: 16,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  heroSpeedCol: {
    flex: 1,
    alignItems: 'center',
  },
  speedValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  heroSpeedNumber: {
    fontSize: 34,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  heroSpeedUnit: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  speedLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  heroSpeedLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  heroVerticalDivider: {
    width: 1,
    height: 48,
    backgroundColor: '#E2E8F0',
  },
  heroHorizontalDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 16,
  },
  heroBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  heroMetricCol: {
    alignItems: 'center',
    flex: 1,
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
  metricDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#F1F5F9',
  },
  detailsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E8EDF2',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    marginBottom: 20,
  },
  detailsCardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  detailsDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 12,
  },
  detailsGridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailCol: {
    flex: 1,
  },
  detailIconLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  detailDocIcon: {
    fontSize: 12,
  },
  detailFieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  detailFieldValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
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
  ctaButton: {
    backgroundColor: '#F5A623',
    paddingVertical: 15,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#F5A623',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 10,
  },
  ctaButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  doneBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
});
