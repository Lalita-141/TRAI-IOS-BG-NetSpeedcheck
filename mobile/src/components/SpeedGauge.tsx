import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

interface SpeedGaugeProps {
  value: number; // e.g., Mbps or ms
  maxValue?: number;
  label?: string;
  unit?: string;
  phase?: string;
  isTesting?: boolean;
}

export const SpeedGauge: React.FC<SpeedGaugeProps> = ({
  value = 0,
  maxValue = 100,
  label = 'DOWNLOAD',
  unit = 'Mbps',
  phase = 'idle',
  isTesting = false,
}) => {
  const size = 210;
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  // 270 degree arc (from 135 deg to 405 deg)
  const arcLength = circumference * 0.75;
  const clampedValue = Math.min(Math.max(value, 0), maxValue);
  const strokeDashoffset = arcLength - (arcLength * clampedValue) / maxValue;

  // Determine accent color
  let primaryColor = '#00A389'; // Teal
  let secondaryColor = '#0284C7'; // Blue
  if (phase === 'ping') {
    primaryColor = '#D97706'; // Amber
    secondaryColor = '#F59E0B';
  } else if (phase === 'upload') {
    primaryColor = '#7C3AED'; // Purple
    secondaryColor = '#A855F7';
  } else if (phase === 'complete') {
    primaryColor = '#059669'; // Emerald
    secondaryColor = '#00A389';
  } else if (phase === 'error') {
    primaryColor = '#EF4444';
    secondaryColor = '#DC2626';
  }

  return (
    <View style={styles.container}>
      <Svg width={size} height={size} style={styles.svg}>
        <Defs>
          <LinearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={primaryColor} stopOpacity="1" />
            <Stop offset="100%" stopColor={secondaryColor} stopOpacity="1" />
          </LinearGradient>
          <LinearGradient id="trackGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#E2E8F0" stopOpacity="0.9" />
            <Stop offset="100%" stopColor="#EDF2F7" stopOpacity="0.9" />
          </LinearGradient>
        </Defs>

        {/* Background Track Arc */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#trackGradient)"
          strokeWidth={strokeWidth}
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeDashoffset={0}
          strokeLinecap="round"
          fill="none"
          transform={`rotate(135 ${size / 2} ${size / 2})`}
        />

        {/* Active Progress Arc */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#gaugeGradient)"
          strokeWidth={strokeWidth}
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="none"
          transform={`rotate(135 ${size / 2} ${size / 2})`}
        />
      </Svg>

      {/* Center Reading */}
      <View style={styles.centerContent}>
        <Text style={styles.label}>{label.toUpperCase()}</Text>
        <Text style={styles.valueText}>
          {value > 0 ? value.toFixed(value >= 10 ? 1 : 2) : '--'}
        </Text>
        <Text style={styles.unitText}>{unit}</Text>
        {isTesting && (
          <View style={[styles.pulseBadge, { backgroundColor: primaryColor + '15' }]}>
            <View style={[styles.pulseDot, { backgroundColor: primaryColor }]} />
            <Text style={[styles.pulseText, { color: primaryColor }]}>TESTING</Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
  },
  svg: {
    transform: [{ scaleX: 1 }],
  },
  centerContent: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: '#64748B',
    marginBottom: 4,
  },
  valueText: {
    fontSize: 40,
    fontWeight: '800',
    color: '#0F172A',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  unitText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
    marginTop: -2,
  },
  pulseBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    marginTop: 6,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  pulseText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
});
