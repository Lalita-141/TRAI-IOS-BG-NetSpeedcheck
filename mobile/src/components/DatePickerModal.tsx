import React, { useState, useEffect } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon } from './Icons';

interface DatePickerModalProps {
  visible: boolean;
  title?: string;
  selectedDate: Date;
  minDate?: Date;
  onSelect: (date: Date) => void;
  onClose: () => void;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const WEEK_DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export const DatePickerModal: React.FC<DatePickerModalProps> = ({
  visible,
  title = 'Select Date',
  selectedDate,
  minDate,
  onSelect,
  onClose,
}) => {
  const [currentMonth, setCurrentMonth] = useState<number>(selectedDate.getMonth());
  const [currentYear, setCurrentYear] = useState<number>(selectedDate.getFullYear());
  const [tempDate, setTempDate] = useState<Date>(selectedDate);

  // Sync internal state when opened or when selectedDate changes
  useEffect(() => {
    if (visible) {
      setCurrentMonth(selectedDate.getMonth());
      setCurrentYear(selectedDate.getFullYear());
      setTempDate(new Date(selectedDate.getTime()));
    }
  }, [visible, selectedDate]);

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(prev => prev - 1);
    } else {
      setCurrentMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(prev => prev + 1);
    } else {
      setCurrentMonth(prev => prev + 1);
    }
  };

  const isSameDay = (d1: Date, d2: Date) => {
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  };

  const isDateDisabled = (year: number, month: number, day: number) => {
    if (!minDate) return false;
    const testDate = new Date(year, month, day, 23, 59, 59, 999);
    const startOfMinDate = new Date(
      minDate.getFullYear(),
      minDate.getMonth(),
      minDate.getDate(),
      0,
      0,
      0,
      0
    );
    return testDate.getTime() < startOfMinDate.getTime();
  };

  const handleDayPress = (day: number) => {
    if (isDateDisabled(currentYear, currentMonth, day)) return;
    const newDate = new Date(currentYear, currentMonth, day, 12, 0, 0);
    setTempDate(newDate);
  };

  const handlePreset = (offsetDays: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    d.setHours(12, 0, 0, 0);
    setTempDate(d);
    setCurrentMonth(d.getMonth());
    setCurrentYear(d.getFullYear());
  };

  const handleConfirm = () => {
    onSelect(tempDate);
    onClose();
  };

  // Calendar matrix calculation
  const firstDayOfWeek = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

  const today = new Date();

  // Create grid cells
  const gridCells: {
    type: 'prev' | 'current' | 'next';
    day: number;
    year: number;
    month: number;
  }[] = [];

  // Previous month trailing days
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const pMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const pYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    gridCells.push({
      type: 'prev',
      day: daysInPrevMonth - i,
      year: pYear,
      month: pMonth,
    });
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    gridCells.push({
      type: 'current',
      day: d,
      year: currentYear,
      month: currentMonth,
    });
  }

  // Next month leading days to complete full rows (multiple of 7)
  const remainingCells = (7 - (gridCells.length % 7)) % 7;
  for (let n = 1; n <= remainingCells; n++) {
    const nMonth = currentMonth === 11 ? 0 : currentMonth + 1;
    const nYear = currentMonth === 11 ? currentYear + 1 : currentYear;
    gridCells.push({
      type: 'next',
      day: n,
      year: nYear,
      month: nMonth,
    });
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback>
            <View style={styles.modalContent}>
              {/* Header */}
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>{title}</Text>
                  <Text style={styles.modalSubtitle}>
                    {tempDate.toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.closeBtn}
                  onPress={onClose}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <CloseIcon size={20} color="#64748B" />
                </TouchableOpacity>
              </View>

              {/* Quick Preset Buttons */}
              <View style={styles.presetRow}>
                <TouchableOpacity
                  style={styles.presetChip}
                  onPress={() => handlePreset(0)}
                  activeOpacity={0.7}>
                  <Text style={styles.presetText}>Today</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.presetChip}
                  onPress={() => handlePreset(7)}
                  activeOpacity={0.7}>
                  <Text style={styles.presetText}>+7 Days</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.presetChip}
                  onPress={() => handlePreset(14)}
                  activeOpacity={0.7}>
                  <Text style={styles.presetText}>+14 Days</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.presetChip}
                  onPress={() => handlePreset(30)}
                  activeOpacity={0.7}>
                  <Text style={styles.presetText}>+30 Days</Text>
                </TouchableOpacity>
              </View>

              {/* Month Navigation */}
              <View style={styles.monthNavRow}>
                <TouchableOpacity
                  style={styles.navArrowBtn}
                  onPress={handlePrevMonth}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <ChevronLeftIcon size={20} color="#0F172A" />
                </TouchableOpacity>
                <Text style={styles.monthYearText}>
                  {MONTH_NAMES[currentMonth]} {currentYear}
                </Text>
                <TouchableOpacity
                  style={styles.navArrowBtn}
                  onPress={handleNextMonth}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <ChevronRightIcon size={20} color="#0F172A" />
                </TouchableOpacity>
              </View>

              {/* Weekday Labels */}
              <View style={styles.weekdaysRow}>
                {WEEK_DAYS.map((wd, index) => (
                  <View key={index} style={styles.weekdayCell}>
                    <Text style={styles.weekdayText}>{wd}</Text>
                  </View>
                ))}
              </View>

              {/* Days Grid */}
              <View style={styles.daysGrid}>
                {gridCells.map((cell, index) => {
                  if (cell.type !== 'current') {
                    return (
                      <View key={index} style={styles.dayCellContainer}>
                        <Text style={styles.dimmedDayText}>{cell.day}</Text>
                      </View>
                    );
                  }

                  const cellDate = new Date(cell.year, cell.month, cell.day);
                  const isSelected = isSameDay(cellDate, tempDate);
                  const isTodayDate = isSameDay(cellDate, today);
                  const disabled = isDateDisabled(cell.year, cell.month, cell.day);

                  return (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.dayCellContainer,
                        isSelected && styles.selectedDayCell,
                        !isSelected && isTodayDate && styles.todayDayCell,
                      ]}
                      onPress={() => handleDayPress(cell.day)}
                      disabled={disabled}
                      activeOpacity={0.7}>
                      <Text
                        style={[
                          styles.dayText,
                          isSelected && styles.selectedDayText,
                          disabled && styles.disabledDayText,
                        ]}>
                        {cell.day}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Action Buttons */}
              <View style={styles.actionButtonsRow}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={onClose}
                  activeOpacity={0.7}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.confirmBtn}
                  onPress={handleConfirm}
                  activeOpacity={0.85}>
                  <Text style={styles.confirmBtnText}>Confirm Date</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 20,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  modalSubtitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#D97706',
    marginTop: 3,
  },
  closeBtn: {
    padding: 4,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  presetChip: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  monthNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginBottom: 12,
  },
  navArrowBtn: {
    padding: 6,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  monthYearText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  weekdaysRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekdayCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  weekdayText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 20,
  },
  dayCellContainer: {
    width: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    marginVertical: 2,
  },
  selectedDayCell: {
    backgroundColor: '#F5A623',
    shadowColor: '#F5A623',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 3,
  },
  todayDayCell: {
    borderWidth: 1.5,
    borderColor: '#F5A623',
  },
  dayText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  selectedDayText: {
    color: '#0F172A',
    fontWeight: '800',
  },
  dimmedDayText: {
    fontSize: 13,
    color: '#CBD5E1',
  },
  disabledDayText: {
    color: '#E2E8F0',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
  },
  confirmBtn: {
    flex: 1.4,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#F5A623',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#F5A623',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
});
