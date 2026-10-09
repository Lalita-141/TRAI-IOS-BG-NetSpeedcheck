import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface MetricCardProps {
  title: string;
  value: string | number;
  unit?: string;
  subtitle?: string;
  accentColor?: string;
  iconBgColor?: string;
  badge?: string;
  icon?: React.ReactNode;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  unit,
  subtitle,
  accentColor = '#00A389',
  iconBgColor,
  badge,
  icon,
}) => {
  const bgCircle = iconBgColor || `${accentColor}18`;

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        {icon ? (
          <View style={[styles.iconCircle, { backgroundColor: bgCircle }]}>
            {icon}
          </View>
        ) : (
          <View style={[styles.dotIndicator, { backgroundColor: accentColor }]} />
        )}
        <View style={styles.titleArea}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {badge ? (
            <View style={[styles.badge, { backgroundColor: '#ECFDF5' }]}>
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.valueRow}>
        <Text style={styles.value} numberOfLines={1}>{value}</Text>
        {unit ? <Text style={styles.unit}>{unit}</Text> : null}
      </View>

      {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    margin: 5,
    borderWidth: 1,
    borderColor: '#E8EDF2',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  dotIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  titleArea: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 2,
  },
  value: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    fontVariant: ['tabular-nums'],
  },
  unit: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    marginLeft: 4,
  },
  subtitle: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 3,
    fontWeight: '500',
  },
});
