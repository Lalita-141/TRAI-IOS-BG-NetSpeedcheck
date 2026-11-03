import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
} from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

const VISIBLE_MS = 3500;
const FADE_MS = 500;
const INTRO_MS = 1600;
const BREATHE_MS = 2200;
const SWIRL_MS = 9000;

const smooth = Easing.inOut(Easing.sin);

// Starts from the native launch screen (ios/mobile/LaunchScreen.storyboard), which shows only
// splash-bg.png, then fades the logo and text in. The app starts up normally underneath it.
// Behind the logo a green and a teal glow slowly swirl and breathe; tapping the logo makes them flare.
export function SplashScreen() {
  const [visible, setVisible] = useState(true);
  const reduceMotion = useRef(false);
  const intro = useRef(new Animated.Value(0)).current;
  const drift = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;
  const swirl = useRef(new Animated.Value(0)).current;
  const flare = useRef(new Animated.Value(0)).current;
  const exit = useRef(new Animated.Value(0)).current;

  const playTapEffect = useCallback(() => {
    if (reduceMotion.current) return;
    Animated.sequence([
      Animated.timing(flare, { toValue: 1, duration: 260, easing: Easing.out(Easing.sin), useNativeDriver: true }),
      Animated.timing(flare, { toValue: 0, duration: 700, easing: smooth, useNativeDriver: true }),
    ]).start();
  }, [flare]);

  useEffect(() => {
    let running: Animated.CompositeAnimation[] = [];
    let cancelled = false;

    const exitAnimation = Animated.timing(exit, {
      toValue: 1,
      duration: FADE_MS,
      delay: VISIBLE_MS,
      easing: smooth,
      useNativeDriver: true,
    });

    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then(isReduced => {
        if (cancelled) return;
        reduceMotion.current = isReduced;
        if (isReduced) {
          intro.setValue(1);
        } else {
          running = [
            Animated.timing(intro, {
              toValue: 1,
              duration: INTRO_MS,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.timing(drift, {
              toValue: 1,
              duration: VISIBLE_MS + FADE_MS,
              easing: smooth,
              useNativeDriver: true,
            }),
            Animated.loop(
              Animated.sequence([
                Animated.timing(breathe, { toValue: 1, duration: BREATHE_MS, easing: smooth, useNativeDriver: true }),
                Animated.timing(breathe, { toValue: 0, duration: BREATHE_MS, easing: smooth, useNativeDriver: true }),
              ]),
            ),
            Animated.loop(
              Animated.timing(swirl, { toValue: 1, duration: SWIRL_MS, easing: Easing.linear, useNativeDriver: true }),
            ),
          ];
        }
        running.forEach(a => a.start());
        exitAnimation.start(() => setVisible(false));
      });

    return () => {
      cancelled = true;
      running.forEach(a => a.stop());
      exitAnimation.stop();
    };
  }, [intro, drift, breathe, swirl, exit]);

  if (!visible) return null;

  // Staggered entrance driven by one 0→1 value
  const enter = (from: number, to: number, distance = 0) => ({
    opacity: intro.interpolate({ inputRange: [from, to], outputRange: [0, 1], extrapolate: 'clamp' }),
    transform: [
      { translateY: intro.interpolate({ inputRange: [from, to], outputRange: [distance, 0], extrapolate: 'clamp' }) },
    ],
  });

  // Green and teal take turns: one glows in while the other dims
  const glowIn = intro.interpolate({ inputRange: [0, 0.6], outputRange: [0, 1], extrapolate: 'clamp' });
  const greenOpacity = Animated.multiply(glowIn, breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 0.35] }));
  const tealOpacity = Animated.multiply(glowIn, breathe.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }));

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        styles.container,
        { opacity: exit.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) },
      ]}>
      <Animated.Image
        source={require('../assets/splash-bg.png')}
        style={[
          StyleSheet.absoluteFill,
          styles.background,
          {
            transform: [
              { scale: drift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] }) },
              { rotate: drift.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '2deg'] }) },
            ],
          },
        ]}
      />

      <Animated.View
        style={[
          styles.content,
          { transform: [{ scale: exit.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) }] },
        ]}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.halo,
            {
              transform: [
                {
                  scale: Animated.add(
                    breathe.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.06] }),
                    flare.interpolate({ inputRange: [0, 1], outputRange: [0, 0.14] }),
                  ),
                },
                { rotate: swirl.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) },
              ],
            },
          ]}>
          <Animated.View style={[styles.blob, styles.greenBlob, { opacity: greenOpacity }]}>
            <GlowCircle id="splashGreen" color="#22C55E" />
          </Animated.View>
          <Animated.View style={[styles.blob, styles.tealBlob, { opacity: tealOpacity }]}>
            <GlowCircle id="splashTeal" color="#14B8A6" />
          </Animated.View>
          <Animated.View
            style={[
              styles.blob,
              styles.coreBlob,
              { opacity: Animated.add(glowIn, flare.interpolate({ inputRange: [0, 1], outputRange: [0, 0.3] })) },
            ]}>
            <GlowCircle id="splashCore" color="#FFFFFF" strength={1} />
          </Animated.View>
        </Animated.View>

        <Pressable onPress={playTapEffect} hitSlop={24} accessibilityLabel="Hare & Turtle AI Solutions">
          <Animated.View
            style={{
              opacity: intro.interpolate({ inputRange: [0, 0.5], outputRange: [0, 1], extrapolate: 'clamp' }),
              transform: [
                // slow idle float in step with the glow
                { translateY: breathe.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) },
                {
                  scale: Animated.add(
                    intro.interpolate({ inputRange: [0, 0.7], outputRange: [0.92, 1], extrapolate: 'clamp' }),
                    flare.interpolate({ inputRange: [0, 1], outputRange: [0, 0.03] }),
                  ),
                },
              ],
            }}>
            <Image source={require('../assets/splash-logo.png')} style={styles.logo} />
          </Animated.View>
        </Pressable>

        <Animated.Text style={[styles.title, enter(0.3, 0.75, 10)]}>NetSpeed Monitor</Animated.Text>
        <Animated.Text style={[styles.subtitle, enter(0.4, 0.85, 10)]}>Network QoS & Performance</Animated.Text>
      </Animated.View>

      <SafeAreaView style={styles.footerArea}>
        <Animated.View style={[styles.footer, enter(0.55, 1, 8)]}>
          <Text style={styles.developedBy}>Developed by</Text>
          <Text style={styles.company}>{'HARE AND TURTLE AI SOLUTIONS\nPRIVATE LIMITED'}</Text>
        </Animated.View>
      </SafeAreaView>
    </Animated.View>
  );
}

function GlowCircle({ id, color, strength = 0.85 }: { id: string; color: string; strength?: number }) {
  return (
    <Svg width={BLOB_SIZE} height={BLOB_SIZE}>
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={color} stopOpacity={strength} />
          <Stop offset="0.5" stopColor={color} stopOpacity={strength * 0.45} />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Circle cx={BLOB_SIZE / 2} cy={BLOB_SIZE / 2} r={BLOB_SIZE / 2} fill={`url(#${id})`} />
    </Svg>
  );
}

const HALO_SIZE = 380;
const BLOB_SIZE = 280;
// Green and teal sit off-centre on opposite sides so the swirl moves the colours around the logo
const BLOB_OFFSET = 34;

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  background: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  halo: {
    position: 'absolute',
    width: HALO_SIZE,
    height: HALO_SIZE,
    top: '50%',
    // Centred on the logo, which sits 39pt above the content block's centre
    marginTop: -HALO_SIZE / 2 - 39,
  },
  blob: {
    position: 'absolute',
    width: BLOB_SIZE,
    height: BLOB_SIZE,
  },
  greenBlob: {
    left: (HALO_SIZE - BLOB_SIZE) / 2 - BLOB_OFFSET,
    top: (HALO_SIZE - BLOB_SIZE) / 2 - BLOB_OFFSET,
  },
  tealBlob: {
    left: (HALO_SIZE - BLOB_SIZE) / 2 + BLOB_OFFSET,
    top: (HALO_SIZE - BLOB_SIZE) / 2 + BLOB_OFFSET,
  },
  // White centre keeps the logo crisp on top of the colour
  coreBlob: {
    left: (HALO_SIZE - BLOB_SIZE) / 2,
    top: (HALO_SIZE - BLOB_SIZE) / 2,
  },
  logo: {
    width: 260,
    height: 52,
    resizeMode: 'contain',
  },
  title: {
    marginTop: 28,
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    color: '#64748B',
  },
  footerArea: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  footer: {
    alignItems: 'center',
    marginBottom: 28,
  },
  developedBy: {
    fontSize: 11,
    color: '#64748B',
  },
  company: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
  },
});
