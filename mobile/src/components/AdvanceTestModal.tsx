import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Modal,
  TouchableWithoutFeedback,
} from 'react-native';
import {
  ContinuousRepeatIcon,
  ScheduleCalendarClockIcon,
} from './Icons';

interface AdvanceTestModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectContinuous: () => void;
  onSelectSchedule: () => void;
}

export const AdvanceTestModal: React.FC<AdvanceTestModalProps> = ({
  visible,
  onClose,
  onSelectContinuous,
  onSelectSchedule,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.modalBackdrop}>
          <TouchableWithoutFeedback>
            <View style={styles.sheetContainer}>
              {/* Top Drag Indicator */}
              <View style={styles.dragHandle} />

              {/* Title & Subtitle */}
              <Text style={styles.sheetTitle}>Run an Advance Test</Text>
              <Text style={styles.sheetSubtitle}>
                Know more about your experience by running these detailed tests
              </Text>

              {/* Option 1: Continuous Test */}
              <TouchableOpacity
                style={styles.optionCard}
                onPress={onSelectContinuous}
                activeOpacity={0.85}>
                <View style={styles.optionTextCol}>
                  <Text style={styles.optionTitle}>Continuous Test</Text>
                  <Text style={styles.optionSubtitle}>
                    Capture network coverage continuously.
                  </Text>
                </View>
                <View style={[styles.iconCircle, styles.continuousIconBg]}>
                  <ContinuousRepeatIcon size={26} color="#F5A623" />
                </View>
              </TouchableOpacity>

              {/* Option 2: Schedule Test */}
              <TouchableOpacity
                style={styles.optionCard}
                onPress={onSelectSchedule}
                activeOpacity={0.85}>
                <View style={styles.optionTextCol}>
                  <Text style={styles.optionTitle}>Schedule Test</Text>
                  <Text style={styles.optionSubtitle}>
                    Set it once. The app runs tests automatically.
                  </Text>
                </View>
                <View style={[styles.iconCircle, styles.scheduleIconBg]}>
                  <ScheduleCalendarClockIcon size={26} color="#00A389" />
                </View>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 48,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderBottomWidth: 0,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 10,
  },
  dragHandle: {
    width: 44,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 20,
  },
  sheetTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  sheetSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748B',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
    paddingHorizontal: 16,
    lineHeight: 18,
  },
  optionCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E8EDF2',
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  optionTextCol: {
    flex: 1,
    paddingRight: 12,
  },
  optionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.1,
  },
  optionSubtitle: {
    fontSize: 12.5,
    color: '#64748B',
    marginTop: 4,
    lineHeight: 17,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continuousIconBg: {
    backgroundColor: '#FEF3C7',
  },
  scheduleIconBg: {
    backgroundColor: '#E6F7F5',
  },
});
