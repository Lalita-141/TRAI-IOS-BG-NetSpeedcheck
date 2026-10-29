import React, { useState } from 'react';
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
  CalendarIcon,
  RocketIcon,
  StopIcon,
} from './Icons';
import { DatePickerModal } from './DatePickerModal';
import { describeSchedule, WEEKDAY_NAMES } from '../services/scheduledTestService';

export type ScheduleFrequency = 'daily' | 'weekly' | 'monthly';

export interface ScheduledTestConfig {
  frequency: ScheduleFrequency;
  fromDate: string;
  toDate: string;
  fromTs?: number; // start of the "from" day (ms)
  toTs?: number; // end of the "to" day (ms)
  hour?: number; // 0-23 run time
  minute?: number; // 0-59 run time
  weekday?: number; // weekly: 0 = Sunday ... 6 = Saturday
  monthDay?: number; // monthly: 1-31 (last day of shorter months)
}

const MONTH_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const MINUTE_STEP = 5;

interface ScheduledTestSetupViewProps {
  activeSchedule?: ScheduledTestConfig | null;
  onBack: () => void;
  onScheduleTest: (config: ScheduledTestConfig) => void;
  onDisableSchedule?: () => void;
}

export const ScheduledTestSetupView: React.FC<ScheduledTestSetupViewProps> = ({
  activeSchedule = null,
  onBack,
  onScheduleTest,
  onDisableSchedule,
}) => {
  const [frequency, setFrequency] = useState<ScheduleFrequency>(
    activeSchedule?.frequency || 'daily'
  );
  const [fromDate, setFromDate] = useState<Date>(() => new Date());
  const [toDate, setToDate] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d;
  });
  const [activeDatePicker, setActiveDatePicker] = useState<'from' | 'to' | null>(null);
  const [hour, setHour] = useState<number>(activeSchedule?.hour ?? 9);
  const [minute, setMinute] = useState<number>(activeSchedule?.minute ?? 0);
  const [weekday, setWeekday] = useState<number>(activeSchedule?.weekday ?? new Date().getDay());
  const [monthDay, setMonthDay] = useState<number>(activeSchedule?.monthDay ?? new Date().getDate());

  const isPM = hour >= 12;
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;

  const changeHour = (delta: number) => {
    const next = (((hour % 12) + delta) % 12 + 12) % 12;
    setHour(next + (isPM ? 12 : 0));
  };

  const changeMinute = (delta: number) => {
    setMinute(prev => (((prev + delta) % 60) + 60) % 60);
  };

  const setPeriod = (pm: boolean) => {
    setHour((hour % 12) + (pm ? 12 : 0));
  };

  const formatDateDisplay = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const handleSelectDate = (date: Date) => {
    if (activeDatePicker === 'from') {
      setFromDate(date);
      if (date.getTime() > toDate.getTime()) {
        const nextTo = new Date(date);
        nextTo.setDate(date.getDate() + 7);
        setToDate(nextTo);
      }
    } else if (activeDatePicker === 'to') {
      setToDate(date);
    }
  };

  const handleSchedule = () => {
    const fromStart = new Date(fromDate);
    fromStart.setHours(0, 0, 0, 0);
    const toEnd = new Date(toDate);
    toEnd.setHours(23, 59, 59, 999);
    onScheduleTest({
      frequency,
      fromDate: formatDateDisplay(fromDate),
      toDate: formatDateDisplay(toDate),
      fromTs: fromStart.getTime(),
      toTs: toEnd.getTime(),
      hour,
      minute,
      weekday,
      monthDay,
    });
  };

  const previewText = describeSchedule({
    frequency,
    fromDate: '',
    toDate: '',
    hour,
    minute,
    weekday,
    monthDay,
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.7}>
          <BackArrowIcon size={22} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Setting up Scheduled Test</Text>
        <View style={styles.headerRightSpacer} />
      </View>
      <View style={styles.headerDivider} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {/* Section 1: Set Test Frequency */}
        <Text style={styles.sectionHeading}>Set Test Frequency:</Text>

        <View style={styles.pillsRow}>
          {/* Daily Pill */}
          <TouchableOpacity
            style={[
              styles.freqPill,
              frequency === 'daily' ? styles.freqPillActive : styles.freqPillInactive,
            ]}
            onPress={() => setFrequency('daily')}
            activeOpacity={0.8}>
            <Text
              style={[
                styles.freqPillText,
                frequency === 'daily' ? styles.freqPillTextActive : styles.freqPillTextInactive,
              ]}>
              Daily
            </Text>
            <View
              style={[
                styles.radioIndicator,
                frequency === 'daily' ? styles.radioActive : styles.radioInactive,
              ]}
            />
          </TouchableOpacity>

          {/* Weekly Pill */}
          <TouchableOpacity
            style={[
              styles.freqPill,
              frequency === 'weekly' ? styles.freqPillActive : styles.freqPillInactive,
            ]}
            onPress={() => setFrequency('weekly')}
            activeOpacity={0.8}>
            <Text
              style={[
                styles.freqPillText,
                frequency === 'weekly' ? styles.freqPillTextActive : styles.freqPillTextInactive,
              ]}>
              Weekly
            </Text>
            <View
              style={[
                styles.radioIndicator,
                frequency === 'weekly' ? styles.radioActive : styles.radioInactive,
              ]}
            />
          </TouchableOpacity>

          {/* Monthly Pill */}
          <TouchableOpacity
            style={[
              styles.freqPill,
              frequency === 'monthly' ? styles.freqPillActive : styles.freqPillInactive,
            ]}
            onPress={() => setFrequency('monthly')}
            activeOpacity={0.8}>
            <Text
              style={[
                styles.freqPillText,
                frequency === 'monthly' ? styles.freqPillTextActive : styles.freqPillTextInactive,
              ]}>
              Monthly
            </Text>
            <View
              style={[
                styles.radioIndicator,
                frequency === 'monthly' ? styles.radioActive : styles.radioInactive,
              ]}
            />
          </TouchableOpacity>
        </View>

        {/* Section 2: Day & Time of the run */}
        <Text style={[styles.sectionHeading, styles.durationHeadingSpacing]}>Set Test Time:</Text>

        {frequency === 'weekly' && (
          <>
            <Text style={styles.subLabel}>Day of the week</Text>
            <View style={styles.weekdayRow}>
              {WEEKDAY_NAMES.map((name, idx) => (
                <TouchableOpacity
                  key={name}
                  style={[styles.dayChip, styles.weekdayChip, weekday === idx && styles.dayChipActive]}
                  onPress={() => setWeekday(idx)}
                  activeOpacity={0.8}>
                  <Text style={[styles.dayChipText, weekday === idx && styles.dayChipTextActive]}>
                    {name.slice(0, 3)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {frequency === 'monthly' && (
          <>
            <Text style={styles.subLabel}>Day of the month</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.monthDayRow}>
              {MONTH_DAYS.map(d => (
                <TouchableOpacity
                  key={d}
                  style={[styles.dayChip, styles.monthDayChip, monthDay === d && styles.dayChipActive]}
                  onPress={() => setMonthDay(d)}
                  activeOpacity={0.8}>
                  <Text style={[styles.dayChipText, monthDay === d && styles.dayChipTextActive]}>{d}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {monthDay > 28 && (
              <Text style={styles.hintText}>In shorter months the test runs on the last day.</Text>
            )}
          </>
        )}

        <Text style={styles.subLabel}>Time</Text>
        <View style={styles.timeCard}>
          <View style={styles.stepperGroup}>
            <TouchableOpacity style={styles.stepBtn} onPress={() => changeHour(-1)} activeOpacity={0.7}>
              <Text style={styles.stepBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.timeValue}>{hour12.toString().padStart(2, '0')}</Text>
            <TouchableOpacity style={styles.stepBtn} onPress={() => changeHour(1)} activeOpacity={0.7}>
              <Text style={styles.stepBtnText}>+</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.timeColon}>:</Text>

          <View style={styles.stepperGroup}>
            <TouchableOpacity
              style={styles.stepBtn}
              onPress={() => changeMinute(-MINUTE_STEP)}
              activeOpacity={0.7}>
              <Text style={styles.stepBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.timeValue}>{minute.toString().padStart(2, '0')}</Text>
            <TouchableOpacity
              style={styles.stepBtn}
              onPress={() => changeMinute(MINUTE_STEP)}
              activeOpacity={0.7}>
              <Text style={styles.stepBtnText}>+</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.ampmGroup}>
            {(['AM', 'PM'] as const).map(p => {
              const active = (p === 'PM') === isPM;
              return (
                <TouchableOpacity
                  key={p}
                  style={[styles.ampmBtn, active && styles.ampmBtnActive]}
                  onPress={() => setPeriod(p === 'PM')}
                  activeOpacity={0.8}>
                  <Text style={[styles.ampmText, active && styles.ampmTextActive]}>{p}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
        <Text style={styles.previewText}>{previewText}</Text>

        {/* Section 3: Duration and Export */}
        <Text style={[styles.sectionHeading, styles.durationHeadingSpacing]}>
          Select duration and export data from:
        </Text>

        <View style={styles.dateCardsRow}>
          {/* From Card */}
          <TouchableOpacity
            style={[
              styles.dateCard,
              activeDatePicker === 'from' && styles.dateCardActive,
            ]}
            onPress={() => setActiveDatePicker('from')}
            activeOpacity={0.8}>
            <CalendarIcon
              size={20}
              color={activeDatePicker === 'from' ? '#F5A623' : '#64748B'}
            />
            <View style={styles.dateCardTextWrap}>
              <Text style={styles.dateCardLabel}>From</Text>
              <Text style={styles.dateCardValue}>{formatDateDisplay(fromDate)}</Text>
            </View>
          </TouchableOpacity>

          {/* To Card */}
          <TouchableOpacity
            style={[
              styles.dateCard,
              activeDatePicker === 'to' && styles.dateCardActive,
            ]}
            onPress={() => setActiveDatePicker('to')}
            activeOpacity={0.8}>
            <CalendarIcon
              size={20}
              color={activeDatePicker === 'to' ? '#F5A623' : '#64748B'}
            />
            <View style={styles.dateCardTextWrap}>
              <Text style={styles.dateCardLabel}>To</Text>
              <Text style={styles.dateCardValue}>{formatDateDisplay(toDate)}</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Section 3: Action Buttons */}
        {activeSchedule ? (
          <View style={styles.actionContainer}>
            <View style={styles.activeScheduleBox}>
              <View style={styles.activeBadgeRow}>
                <View style={styles.activeDot} />
                <Text style={styles.activeBadgeText}>SCHEDULE CURRENTLY ACTIVE</Text>
              </View>
              <Text style={styles.activeScheduleDetails}>
                Running tests automatically {describeSchedule(activeSchedule)}, from {activeSchedule.fromDate} to {activeSchedule.toDate}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.disableBtn}
              onPress={onDisableSchedule}
              activeOpacity={0.85}>
              <StopIcon size={18} color="#FFFFFF" />
              <Text style={styles.disableBtnText}>Disable Schedule Testing</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.scheduleBtn}
            onPress={handleSchedule}
            activeOpacity={0.85}>
            <RocketIcon size={20} color="#0F172A" />
            <Text style={styles.scheduleBtnText}>Schedule Test</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Interactive Calendar / Date Picker Modal */}
      <DatePickerModal
        visible={activeDatePicker !== null}
        title={activeDatePicker === 'from' ? 'Select Start Date (From)' : 'Select End Date (To)'}
        selectedDate={activeDatePicker === 'from' ? fromDate : toDate}
        minDate={activeDatePicker === 'to' ? fromDate : undefined}
        onSelect={handleSelectDate}
        onClose={() => setActiveDatePicker(null)}
      />
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
    paddingTop: 20,
    paddingBottom: 36,
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 14,
  },
  durationHeadingSpacing: {
    marginTop: 24,
  },
  pillsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  freqPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  freqPillActive: {
    borderWidth: 2,
    borderColor: '#F5A623',
    backgroundColor: '#FFFDF7',
  },
  freqPillInactive: {
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  freqPillText: {
    fontSize: 13,
  },
  freqPillTextActive: {
    fontWeight: '800',
    color: '#0F172A',
  },
  freqPillTextInactive: {
    fontWeight: '600',
    color: '#64748B',
  },
  radioIndicator: {
    width: 18,
    height: 18,
    borderRadius: 9,
    marginLeft: 4,
  },
  radioActive: {
    backgroundColor: '#F5A623',
  },
  radioInactive: {
    borderWidth: 2,
    borderColor: '#CBD5E1',
    backgroundColor: 'transparent',
  },
  dateCardsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  dateCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E8EDF2',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  dateCardActive: {
    borderColor: '#F5A623',
    backgroundColor: '#FFFDF7',
  },
  dateCardTextWrap: {
    flex: 1,
  },
  dateCardLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  dateCardValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
  },
  scheduleBtn: {
    backgroundColor: '#F5A623',
    borderRadius: 28,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 36,
    gap: 8,
    shadowColor: '#F5A623',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  scheduleBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  actionContainer: {
    marginTop: 28,
  },
  activeScheduleBox: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#10B981',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  activeBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  activeBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#10B981',
    letterSpacing: 0.8,
  },
  activeScheduleDetails: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 18,
    fontWeight: '500',
  },
  disableBtn: {
    backgroundColor: '#EF4444',
    borderRadius: 28,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  disableBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  subLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 8,
    marginTop: 4,
  },
  weekdayRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 14,
  },
  monthDayRow: {
    gap: 6,
    paddingBottom: 4,
    marginBottom: 10,
  },
  dayChip: {
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  weekdayChip: {
    flex: 1,
  },
  monthDayChip: {
    width: 42,
  },
  dayChipActive: {
    borderWidth: 2,
    borderColor: '#F5A623',
    backgroundColor: '#FFFDF7',
  },
  dayChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  dayChipTextActive: {
    fontWeight: '800',
    color: '#0F172A',
  },
  hintText: {
    fontSize: 11,
    color: '#94A3B8',
    marginBottom: 10,
  },
  timeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E8EDF2',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  stepperGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  timeValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    minWidth: 30,
    textAlign: 'center',
  },
  timeColon: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  ampmGroup: {
    flexDirection: 'row',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  ampmBtn: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: '#FFFFFF',
  },
  ampmBtnActive: {
    backgroundColor: '#F5A623',
  },
  ampmText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  ampmTextActive: {
    color: '#0F172A',
    fontWeight: '800',
  },
  previewText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginTop: 8,
  },
});
