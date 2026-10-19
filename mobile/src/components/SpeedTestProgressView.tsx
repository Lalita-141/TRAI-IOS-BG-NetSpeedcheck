import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  SafeAreaView,
  Dimensions,
} from 'react-native';
import Svg, {
  Path,
  Circle,
  Defs,
  LinearGradient,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { MonitorStatus } from '../services/monitorService';
import {
  BackArrowIcon,
  StepperLatencyIcon,
  StepperDownloadIcon,
  StepperUploadIcon,
} from './Icons';

interface SpeedTestProgressViewProps {
  status: MonitorStatus;
  onCancel: () => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export const SpeedTestProgressView: React.FC<SpeedTestProgressViewProps> = ({
  status,
  onCancel,
}) => {
  const progress = status.currentProgress;
  const phase = progress?.phase || 'idle';

  // Determine current active speed
  let currentSpeed = 0;
  if (phase === 'ping') {
    currentSpeed = progress?.latency ?? 0;
  } else if (phase === 'download') {
    currentSpeed = progress?.downSpeed ?? 0;
  } else if (phase === 'upload') {
    currentSpeed = progress?.upSpeed ?? 0;
  }

  // Stepper values
  const latencyDisplay = progress?.latency != null ? `${Math.round(progress.latency)} ms` : '--';
  const downloadDisplay =
    progress?.downSpeed != null ? `${progress.downSpeed.toFixed(2)} Mbps` : '--';
  const uploadDisplay =
    progress?.upSpeed != null ? `${progress.upSpeed.toFixed(2)} Mbps` : '--';

  const isLatencyActive = phase === 'ping';
  const isLatencyDone = phase === 'download' || phase === 'upload' || phase === 'complete';

  const isDownloadActive = phase === 'download';
  const isDownloadDone = phase === 'upload' || phase === 'complete';

  const isUploadActive = phase === 'upload';
  const isUploadDone = phase === 'complete';

  // Semi-circular speedometer gauge params
  const gaugeSize = Math.min(SCREEN_WIDTH - 60, 260);
  const strokeWidth = 14;
  const radius = (gaugeSize - strokeWidth) / 2;
  const maxScale = 500;
  const clampedVal = Math.min(Math.max(currentSpeed, 0), maxScale);

  // 220 degree arc
  const startAngle = 160;
  const endAngle = 380;
  const totalAngle = endAngle - startAngle;
  const currentAngle = startAngle + (clampedVal / maxScale) * totalAngle;

  const polarToCartesian = (cx: number, cy: number, r: number, angleInDegrees: number) => {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
    return {
      x: cx + r * Math.cos(angleInRadians),
      y: cy + r * Math.sin(angleInRadians),
    };
  };

  const describeArc = (x: number, y: number, r: number, startA: number, endA: number) => {
    const start = polarToCartesian(x, y, r, endA);
    const end = polarToCartesian(x, y, r, startA);
    const largeArcFlag = endA - startA <= 180 ? '0' : '1';
    return ['M', start.x, start.y, 'A', r, r, 0, largeArcFlag, 0, end.x, end.y].join(' ');
  };

  const centerPoint = gaugeSize / 2;
  const trackPath = describeArc(centerPoint, centerPoint, radius, startAngle, endAngle);
  const activePath = describeArc(centerPoint, centerPoint, radius, startAngle, Math.max(currentAngle, startAngle + 1));
  const dotPos = polarToCartesian(centerPoint, centerPoint, radius, Math.max(currentAngle, startAngle));

  // Gauge tick marks
  const ticks = [5, 25, 50, 150, 250, 350, 500];



  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top Navigation Bar with Back Button */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onCancel} activeOpacity={0.7}>
          <BackArrowIcon size={22} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Speed Test</Text>
        <View style={styles.headerRightSpacer} />
      </View>

      {/* Stepper Phase Bar (Latency -> Download -> Upload) */}
      <View style={styles.stepperContainer}>
        {/* Connecting Progress Lines */}
        <View style={styles.stepperLinesContainer}>
          <View
            style={[
              styles.stepperLine,
              isDownloadActive || isDownloadDone ? styles.stepperLineActive : null,
            ]}
          />
          <View
            style={[
              styles.stepperLine,
              isUploadActive || isUploadDone ? styles.stepperLineActive : null,
            ]}
          />
        </View>

        {/* 1. Latency Step */}
        <View style={styles.stepItem}>
          <View
            style={[
              styles.stepCircle,
              isLatencyActive
                ? styles.stepCircleActive
                : isLatencyDone
                ? styles.stepCircleDone
                : styles.stepCirclePending,
            ]}>
            <StepperLatencyIcon
              size={18}
              color={isLatencyActive || isLatencyDone ? '#0F172A' : '#94A3B8'}
            />
          </View>
          <Text style={styles.stepLabel}>Latency</Text>
          <Text style={styles.stepValue}>{latencyDisplay}</Text>
        </View>

        {/* 2. Download Step */}
        <View style={styles.stepItem}>
          <View
            style={[
              styles.stepCircle,
              isDownloadActive
                ? styles.stepCircleActive
                : isDownloadDone
                ? styles.stepCircleDone
                : styles.stepCirclePending,
            ]}>
            <StepperDownloadIcon
              size={18}
              color={isDownloadActive || isDownloadDone ? '#0F172A' : '#94A3B8'}
            />
          </View>
          <Text style={styles.stepLabel}>Download</Text>
          <Text style={styles.stepValue}>{downloadDisplay}</Text>
        </View>

        {/* 3. Upload Step */}
        <View style={styles.stepItem}>
          <View
            style={[
              styles.stepCircle,
              isUploadActive
                ? styles.stepCircleActive
                : isUploadDone
                ? styles.stepCircleDone
                : styles.stepCirclePending,
            ]}>
            <StepperUploadIcon
              size={18}
              color={isUploadActive || isUploadDone ? '#0F172A' : '#94A3B8'}
            />
          </View>
          <Text style={styles.stepLabel}>Upload</Text>
          <Text style={styles.stepValue}>{uploadDisplay}</Text>
        </View>
      </View>

      {/* Speedometer Gauge */}
      <View style={styles.gaugeSection}>
        <View style={{ width: gaugeSize, height: gaugeSize }}>
          <Svg width={gaugeSize} height={gaugeSize}>
            <Defs>
              <LinearGradient id="activeArcGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%" stopColor="#00A389" />
                <Stop offset="100%" stopColor="#F5A623" />
              </LinearGradient>
            </Defs>

            {/* Background Track */}
            <Path
              d={trackPath}
              stroke="#E2E8F0"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              fill="none"
            />

            {/* Active Arc */}
            <Path
              d={activePath}
              stroke="url(#activeArcGrad)"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              fill="none"
            />

            {/* End Indicator Dot */}
            <Circle cx={dotPos.x} cy={dotPos.y} r={8} fill="#F5A623" />
            <Circle cx={dotPos.x} cy={dotPos.y} r={4} fill="#FFFFFF" />

            {/* Ticks on scale */}
            {ticks.map(val => {
              const ang = startAngle + (val / maxScale) * totalAngle;
              const pos = polarToCartesian(centerPoint, centerPoint, radius - 20, ang);
              return (
                <SvgText
                  key={val}
                  x={pos.x}
                  y={pos.y + 4}
                  fill="#94A3B8"
                  fontSize={10}
                  fontWeight="600"
                  textAnchor="middle">
                  {val}
                </SvgText>
              );
            })}
          </Svg>

          {/* Center Value */}
          <View style={styles.gaugeCenter}>
            <Text style={styles.gaugeValueText}>
              {currentSpeed > 0 ? currentSpeed.toFixed(2) : '0.00'}
            </Text>
            <Text style={styles.gaugeUnitText}>
              {phase === 'ping' ? 'ms' : 'Mbps'}
            </Text>
            <Text style={styles.gaugePhaseText}>{phase.toUpperCase()}</Text>
          </View>
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
    justifyContent: 'space-between',
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
  stepperLinesContainer: {
    position: 'absolute',
    top: 36,
    left: 60,
    right: 60,
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 0,
  },
  stepperLine: {
    flex: 1,
    height: 3,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 10,
    borderRadius: 2,
  },
  stepperLineActive: {
    backgroundColor: '#F5A623',
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
    backgroundColor: '#F5A623',
    shadowColor: '#F5A623',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  stepCircleDone: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1.5,
    borderColor: '#F5A623',
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
  gaugeSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  gaugeCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gaugeValueText: {
    fontSize: 42,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  gaugeUnitText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
    marginTop: -2,
  },
  gaugePhaseText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#00A389',
    letterSpacing: 1.2,
    marginTop: 6,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 10,
  },
});
