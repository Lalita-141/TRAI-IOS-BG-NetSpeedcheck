import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  SafeAreaView,
} from 'react-native';
import {
  BackArrowIcon,
  VideoBrowserTestIcon,
  GlobeIcon,
} from './Icons';
import { useBackgroundKeepAlive } from '../services/backgroundKeepAlive';
import { VideoBrowserTestResults, runVideoBrowserTest } from '../services/singleTests';
import { Sample } from '../types';

export type { VideoBrowserTestResults };

interface VideoBrowserTestProgressViewProps {
  onCancel: () => void;
  onComplete: (results: VideoBrowserTestResults, sample: Sample | null) => void;
}

export const VideoBrowserTestProgressView: React.FC<VideoBrowserTestProgressViewProps> = ({
  onCancel,
  onComplete,
}) => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [phase, setPhase] = useState<'video' | 'web' | 'done'>('video');
  const [measured, setMeasured] = useState<Partial<VideoBrowserTestResults>>({});

  // The test keeps running if the screen turns off
  useBackgroundKeepAlive('video-browser-test');

  // Elapsed seconds timer
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Runs once: a re-render of the parent must not start the measurement again
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  useEffect(() => {
    let isMounted = true;

    runVideoBrowserTest((nextPhase, partial) => {
      if (!isMounted) return;
      setPhase(nextPhase);
      setMeasured(partial);
    })
      .then(({ results, sample }) => {
        if (!isMounted) return;
        setPhase('done');
        onCompleteRef.current(results, sample);
      })
      .catch(err => {
        console.warn('Video & browser test failed:', err);
        if (isMounted) {
          onCompleteRef.current(
            {
              videoDelayMs: null,
              videoMbps: null,
              streamingQuality: null,
              webDelayMs: null,
              ttfbMs: null,
              pageLoadSec: null,
              error: err?.message || 'Test failed',
            },
            null
          );
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const statusText = phase === 'video' ? 'Measuring video stream' : 'Measuring web page load';

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top Header with Back Arrow */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onCancel} activeOpacity={0.7}>
          <BackArrowIcon size={22} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Video and Browser Test</Text>
        <View style={styles.headerRightSpacer} />
      </View>

      {/* Stepper Bar: Video Delay -> Web Delay */}
      <View style={styles.stepperContainer}>
        {/* Connecting Progress Line */}
        <View style={styles.stepperLineTrack}>
          <View
            style={[
              styles.stepperLineFill,
              phase === 'web' || phase === 'done' ? styles.stepperLineActive : null,
            ]}
          />
        </View>

        {/* Step 1: Video Delay */}
        <View style={styles.stepItem}>
          <View
            style={[
              styles.stepCircle,
              phase === 'video'
                ? styles.stepCircleActive
                : styles.stepCircleDone,
            ]}>
            <VideoBrowserTestIcon
              size={20}
              color="#0F172A"
            />
          </View>
          <Text style={styles.stepLabel}>Video Delay</Text>
          <Text style={styles.stepValue}>
            {measured.videoDelayMs != null
              ? `${measured.videoDelayMs} ms`
              : phase === 'video'
              ? 'Testing...'
              : '--'}
          </Text>
        </View>

        {/* Step 2: Web Delay */}
        <View style={styles.stepItem}>
          <View
            style={[
              styles.stepCircle,
              phase === 'web'
                ? styles.stepCircleActive
                : phase === 'done'
                ? styles.stepCircleDone
                : styles.stepCirclePending,
            ]}>
            <GlobeIcon
              size={20}
              color={phase === 'web' || phase === 'done' ? '#0F172A' : '#94A3B8'}
            />
          </View>
          <Text style={styles.stepLabel}>Web Delay</Text>
          <Text style={styles.stepValue}>{phase === 'web' ? 'Testing...' : '--'}</Text>
        </View>
      </View>

      {/* Center Status Card */}
      <View style={styles.viewportContainer}>
        <View style={styles.videoCard}>
          <View style={styles.playerTopBar}>
            <View style={styles.qualityPill}>
              <View style={styles.qualityDot} />
              <Text style={styles.qualityText}>{statusText}</Text>
            </View>
          </View>

          <View style={styles.videoViewport}>
            <View style={styles.viewportStatus}>
              {phase === 'video' ? (
                <VideoBrowserTestIcon size={40} color="#FFFFFF" />
              ) : (
                <GlobeIcon size={40} color="#FFFFFF" />
              )}
              <Text style={styles.viewportStatusText}>{statusText}...</Text>
            </View>
          </View>

          <View style={styles.playerScrubberTrack}>
            <View
              style={[
                styles.playerScrubberFill,
                phase === 'video' ? styles.scrubberVideo : styles.scrubberWeb,
              ]}
            />
          </View>
        </View>
      </View>

      {/* Bottom: real elapsed time and measured throughput */}
      <View style={styles.graphContainer}>
        <View style={styles.graphHeader}>
          <Text style={styles.graphTimeSpent}>
            Time spent <Text style={styles.graphTimeBold}>{elapsedSeconds} s</Text>
          </Text>
          <Text style={styles.graphCurrentSpeed}>
            {measured.videoMbps != null ? `${measured.videoMbps.toFixed(2)} Mbps` : '-- Mbps'}
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
    left: 80,
    right: 80,
    height: 3,
    backgroundColor: '#E2E8F0',
    borderRadius: 2,
    zIndex: 0,
  },
  stepperLineFill: {
    height: '100%',
    width: '0%',
    backgroundColor: '#F5A623',
    borderRadius: 2,
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
  viewportContainer: {
    paddingHorizontal: 16,
    marginTop: 14,
    marginBottom: 6,
  },
  videoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E8EDF2',
    height: 205,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  playerTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
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
  bufferText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  videoViewport: {
    flex: 1,
    backgroundColor: '#0B1120',
    position: 'relative',
    overflow: 'hidden',
  },
  viewportStatus: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  viewportStatusText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  videoWebView: {
    flex: 1,
    backgroundColor: '#0B1120',
  },
  videoWatermark: {
    position: 'absolute',
    bottom: 8,
    right: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  videoWatermarkText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  playerScrubberTrack: {
    height: 4,
    width: '100%',
    backgroundColor: '#F1F5F9',
  },
  playerScrubberFill: {
    height: '100%',
    backgroundColor: '#00A389',
  },
  graphContainer: {
    marginTop: 14,
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  graphHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  graphTimeSpent: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  graphTimeBold: {
    color: '#0F172A',
    fontWeight: '800',
  },
  graphCurrentSpeed: {
    fontSize: 14,
    fontWeight: '800',
    color: '#00A389',
    fontVariant: ['tabular-nums'],
  },
  graphCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E8EDF2',
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  scrubberVideo: {
    width: '55%',
  },
  scrubberWeb: {
    width: '100%',
  },
});
