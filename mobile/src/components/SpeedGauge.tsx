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
  const size = 200;
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  // We use 270 degrees arc (from 135 deg to 405 deg)
  const arcLength = circumference * 0.75;
  const clampedValue = Math.min(Math.max(value, 0), maxValue);
  const strokeDashoffset = arcLength - (arcLength * clampedValue) / maxValue;

  // Determine color based on phase
  let primaryColor = '#06B6D4'; // Cyan default
  let secondaryColor = '#3B82F6'; // Blue
  if (phase === 'ping') {
    primaryColor = '#F59E0B'; // Amber
    secondaryColor = '#EF4444';
  } else if (phase === 'upload') {
    primaryColor = '#8B5CF6'; // Purple
    secondaryColor = '#EC4899'; // Pink
  } else if (phase === 'complete') {
    primaryColor = '#10B981'; // Emerald
    secondaryColor = '#06B6D4';
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
            <Stop offset="0%" stopColor="#1E293B" stopOpacity="0.8" />
            <Stop offset="100%" stopColor="#0F172A" stopOpacity="0.8" />
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
        <Text style={[styles.label, { color: primaryColor }]}>{label.toUpperCase()}</Text>
        <Text style={styles.valueText}>
          {value > 0 ? value.toFixed(value >= 10 ? 1 : 2) : '--'}
        </Text>
        <Text style={styles.unitText}>{unit}</Text>
        {isTesting && (
          <View style={[styles.pulseBadge, { backgroundColor: primaryColor + '20' }]}>
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
    marginVertical: 12,
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
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  valueText: {
    fontSize: 38,
    fontWeight: '800',
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
  unitText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94A3B8',
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
