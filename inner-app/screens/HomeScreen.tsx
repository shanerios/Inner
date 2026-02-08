// @refresh reset
import { Asset } from 'expo-asset';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, AppState, Dimensions, Easing, Image, Modal, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Directions, Gesture, GestureDetector } from 'react-native-gesture-handler';
import Purchases from 'react-native-purchases';
import RevenueCatUI from 'react-native-purchases-ui';
import FogPulse from '../components/FogPulse';
import HomeAuraContinuity from '../components/HomeAuraContinuity';
import SettingsModal from '../components/SettingsModal';
import { CHAMBERS, LESSONS, SOUNDSCAPES } from '../data/suggestions';
import { getTodaySuggestion } from '../utils/suggest';

import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { Audio } from 'expo-av';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import LottieView from 'lottie-react-native';
import { useCallback } from 'react';
import { shouldShowDailyMicroRitual, useDailyPracticeSnapshot } from '../core/DailyRitual';
import { awardEmber, EmberState, getEmberState } from '../core/EmberEngine';
import { getLastSession, INTENTION_THEME, setLastSession } from '../core/session';
import { TimeEngine } from '../src/core/time/TimeEngine';



import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useIntention } from '../core/IntentionProvider';
import { startFromSuggestion } from '../lib/startRoutes';

import { useBreath } from '../core/BreathProvider';
import { Body as _Body, Typography as _Typography, Typography } from '../core/typography';
import { useLunarWhisper } from '../hooks/useLunarWhisper';
import { useThreadSuggestion } from '../hooks/useThreadSuggestion';
import { useWalkthrough } from '../hooks/useWalkthrough';
import LunarWhisperModal from '../src/lunar/LunarWhisperModal';
import { orbMoonImages } from '../src/ui/orbMoonImages';
const Body = _Body ?? ({ regular: { ..._Typography.body }, subtle: { ..._Typography.caption } } as const);

// --- Intention Aura helpers ---
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = hex?.replace('#', '').match(/^([0-9a-f]{6}|[0-9a-f]{3})$/i);
  if (!m) return { r: 150, g: 140, b: 200 };
  let h = m[1].toLowerCase();
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const num = parseInt(h, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}
function rgbaFromTint(tint?: string, a = 0.16): string {
  const { r, g, b } = hexToRgb(tint || '#8E88D8');
  return `rgba(${r},${g},${b},${a})`;
}
function computeAuraColors(intentions?: string[] | null, fallbackFrom?: string[]): string[] {
  const keysRaw = intentions && intentions.length ? intentions : [];
  const keys = keysRaw.map(k => String(k).trim().toLowerCase()).filter(Boolean).slice(0, 2);

  if (keys.length === 1) {
    const c = (INTENTION_THEME as any)[keys[0]]?.tint || '#8E88D8';
    return [rgbaFromTint(c, 0.08), rgbaFromTint(c, 0.04)];
  } else if (keys.length >= 2) {
    const c1 = (INTENTION_THEME as any)[keys[0]]?.tint || '#8E88D8';
    const c2 = (INTENTION_THEME as any)[keys[1]]?.tint || '#8E88D8';
    return [rgbaFromTint(c1, 0.08), rgbaFromTint(c2, 0.05)];
  }
  return fallbackFrom || [rgbaFromTint('#8E88D8', 0.10), rgbaFromTint('#8E88D8', 0.04)];
}

// Helper: TitleCase for levels like 'advanced' → 'Advanced'
const toTitle = (s?: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');


const AnimatedPressable = Animated.createAnimatedComponent(Pressable);


function formatMinSec(ms?: number) {
    if (!ms || ms < 0) return '0:00';
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// Map chamber names to a sensible default track id for resume fallback
const CHAMBER_DEFAULT_TRACK: Record<string, string> = {
  'chamber 1': 'chamber1_guided',
  'chamber one': 'chamber1_guided',
};

function normalizeChamberName(v?: string) {
  return (v || '').trim().toLowerCase();
}

// IDs we should never "resume" (ambient/background)
const AMBIENT_IDS = new Set(['home_hum', 'homepage_hum', 'ambient_hum']);
const isAmbient = (id?: string) => !!id && AMBIENT_IDS.has(id);

// --- Inline Home Helper Modal (first version; can be extracted later) ---
type HomeWalkSteps = {
  chambers: boolean;
  soundscapes: boolean;
  orb: boolean;
  learnHub: boolean;
};

type HomeWalkStepId = 'orb' | 'chambers' | 'soundscapes' | 'learnHub';

const getFirstIncompleteStep = (steps: HomeWalkSteps): HomeWalkStepId | null => {
  if (!steps.orb) return 'orb';
  if (!steps.chambers) return 'chambers';
  if (!steps.soundscapes) return 'soundscapes';
  if (!steps.learnHub) return 'learnHub';
  return null;
};

const HOME_WALK_STEPS_KEY = 'walk:home:steps_v1';
type HomeHelperModalProps = {
  visible: boolean;
  onClose: () => void;
  onDismissForever: () => void;
  steps: HomeWalkSteps;
  activeStep?: HomeWalkStepId | null;
  tutorialMode: boolean;
  onStartTutorial: () => void;

  // NEW: allow tapping checklist items to complete steps
  onOrbPress: () => void;
  onNavPress: () => void;
  onLearnPress: () => void;
};

function HomeHelperModalInline({
  visible,
  onClose,
  onDismissForever,
  steps,
  activeStep,
  tutorialMode,
  onStartTutorial,
  onOrbPress,
  onNavPress,
  onLearnPress,
}: HomeHelperModalProps) {

  // Animated checklist values and effects
  const orbAnim = React.useRef(new Animated.Value(steps.orb ? 1 : 0)).current;
  const navAnim = React.useRef(new Animated.Value((steps.chambers && steps.soundscapes) ? 1 : 0)).current;
  const learnAnim = React.useRef(new Animated.Value(steps.learnHub ? 1 : 0)).current;

  React.useEffect(() => {
    if (steps.orb) {
      Animated.spring(orbAnim, {
        toValue: 1,
        friction: 6,
        tension: 80,
        useNativeDriver: true,
      }).start();
    }
  }, [steps.orb, orbAnim]);

  React.useEffect(() => {
    if (steps.chambers && steps.soundscapes) {
      Animated.spring(navAnim, {
        toValue: 1,
        friction: 6,
        tension: 80,
        useNativeDriver: true,
      }).start();
    }
  }, [steps.chambers, steps.soundscapes, navAnim]);

  React.useEffect(() => {
    if (steps.learnHub) {
      Animated.spring(learnAnim, {
        toValue: 1,
        friction: 6,
        tension: 80,
        useNativeDriver: true,
      }).start();
    }
  }, [steps.learnHub, learnAnim]);

  // Step highlight flags
  const isOrbActive = activeStep === 'orb';
  const isNavActive = activeStep === 'chambers' || activeStep === 'soundscapes';
  const isLearnActive = activeStep === 'learnHub';

  // Clickable flags for checklist items (tutorial gating)
  const canClickOrb = !tutorialMode || activeStep === 'orb';
  const canClickNav = !tutorialMode || activeStep === 'chambers' || activeStep === 'soundscapes';
  const canClickLearn = !tutorialMode || activeStep === 'learnHub';

    // Derived header text + step index
  const allDone = steps.orb && steps.chambers && steps.soundscapes && steps.learnHub;

  // We treat nav (chambers + soundscapes) as a single "step"
  const stepTotal = 3;
  let stepIndex: number | null = null;

  if (!steps.orb) {
    stepIndex = 1;
  } else if (!steps.chambers || !steps.soundscapes) {
    stepIndex = 2;
  } else if (!steps.learnHub) {
    stepIndex = 3;
  }

  let headerTitle = 'Welcome to Inner';
  let headerSubtitle = 'A quick tour of your Home.';

  if (tutorialMode) {
    if (allDone) {
      headerTitle = 'Tutorial complete';
      headerSubtitle = 'You can revisit this guide anytime from the ? icon.';
    } else if (activeStep === 'orb') {
      headerTitle = 'Step 1 · The Orb';
      headerSubtitle = 'This is your entry point. Tap it to begin a short centering ritual or resume your last journey.';
    } else if (activeStep === 'chambers' || activeStep === 'soundscapes') {
      headerTitle = 'Step 2 · Explore paths';
      headerSubtitle = 'Use the chevrons or swipes: left chevron or swipe right for Soundscapes, right chevron or swipe left for Chambers.';
    } else if (activeStep === 'learnHub') {
      headerTitle = 'Step 3 · Learning Hub';
      headerSubtitle = 'Swipe up or tap the bottom chevron to reveal guides, practices, and deeper teachings.';
    }
  } else if (activeStep) {
    // Non-tutorial mode but still guiding the next action
    if (activeStep === 'orb') {
      headerTitle = 'Start with the orb';
      headerSubtitle = 'Tap the orb to begin a short reflection or centering exercise, or to resume where you left off.';
    } else if (activeStep === 'chambers' || activeStep === 'soundscapes') {
      headerTitle = 'Try exploring the side paths';
      headerSubtitle = 'Tap the left chevron or swipe right for Soundscapes; tap the right chevron or swipe left for Chambers.';
    } else if (activeStep === 'learnHub') {
      headerTitle = 'Visit the Learning Hub';
      headerSubtitle = 'Tap the bottom chevron or swipe up to open your library of guides and practices.';
    }
  }
  if (!visible) return null;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        alignItems: 'center',
        justifyContent: 'flex-end',
        paddingHorizontal: 20,
        paddingTop: 40,
        paddingBottom: 32,
        zIndex: 200,
        elevation: 200,
      }}
    >
      {/* Dimmed background layer; non-interactive so touches pass through */}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          {
            backgroundColor: 'rgba(8,8,16,0.55)',
          },
        ]}
      />

      {/* Helper card — touches are handled only by explicit tap targets inside */}
      <View
        style={{
          maxWidth: 420,
          width: '92%',
          backgroundColor: 'rgba(14,14,28,0.88)',
          borderRadius: 16,
          paddingVertical: 16,
          paddingHorizontal: 16,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.08)',
          marginBottom: 90,
        }}
      >
                        <Text
              style={[
                Typography.title,
                {
                  color: '#F0EEF8',
                  textAlign: 'center',
                  marginBottom: 4,
                },
              ]}
            >
              {headerTitle}
            </Text>

            {/* Optional "Step X of 3" chip when not finished */}
            {stepIndex !== null && !allDone && (
              <Text
                style={{
                  fontFamily: 'Inter-ExtraLight',
                  fontSize: 11,
                  letterSpacing: 0.6,
                  color: '#B5A9FF',
                  textAlign: 'center',
                  marginBottom: 2,
                  textTransform: 'uppercase',
                }}
              >
                Step {stepIndex} of {stepTotal}
              </Text>
            )}

            <Text
              style={[
                Body.subtle,
                {
                  fontFamily: 'Inter-ExtraLight',
                  color: '#DCD5F0',
                  fontSize: 14,
                  textAlign: 'center',
                },
              ]}
            >
              {headerSubtitle}
            </Text>

            <View style={{ height: 10 }} />
            <View style={{ gap: 8 }}>
              {/* Orb step */}
<Animated.View
  style={{
    transform: [{ scale: isOrbActive ? 1.03 : 1 }],
  }}
>
  <TouchableOpacity
    activeOpacity={0.85}
    onPress={async () => {
      if (!canClickOrb) return;
      try { await Haptics.selectionAsync(); } catch {}
      onOrbPress?.();
    }}
    style={{
      borderRadius: 10,
      backgroundColor: isOrbActive ? 'rgba(255,255,255,0.05)' : 'transparent',
    }}
  >
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 4,
        paddingHorizontal: 6,
        borderRadius: 10,
      }}
    >
    <Animated.Text
      style={[
        Body.subtle,
        {
          fontFamily: 'Inter-ExtraLight',
          fontSize: 13,
          color: steps.orb ? '#CFC3E0' : (isOrbActive ? '#B5A9FF' : '#9B96B8'),
          marginRight: 6,
          transform: [
            {
              scale: orbAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.9, 1.3],
              }),
            },
          ],
        },
      ]}
    >
      {steps.orb ? '✓' : '○'}
    </Animated.Text>
    <Text
      style={[
        Body.subtle,
        {
          fontFamily: 'Inter-ExtraLight',
          color: '#EDEAF6',
          fontSize: 13,
          flexShrink: 1,
        },
      ]}
    >
        Tap the orb to start a short centering ritual or resume your journey.
    </Text>
  </View>
</TouchableOpacity>
</Animated.View>

              {/* Chambers + Soundscapes swipe step */}
              <Animated.View
                style={{
                  transform: [{ scale: isNavActive ? 1.03 : 1 }],
                }}
              >
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={async () => {
                    if (!canClickNav) return;
                    try { await Haptics.selectionAsync(); } catch {}
                    onNavPress?.();
                  }}
                  style={{
                    borderRadius: 10,
                    backgroundColor: isNavActive ? 'rgba(255,255,255,0.05)' : 'transparent',
                  }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 4,
                      paddingHorizontal: 6,
                      borderRadius: 10,
                    }}
                  >
                    <Animated.Text
                      style={[
                        Body.subtle,
                        {
                          fontFamily: 'Inter-ExtraLight',
                          fontSize: 13,
                          color: (steps.chambers && steps.soundscapes)
                            ? '#CFC3E0'
                            : (isNavActive ? '#B5A9FF' : '#9B96B8'),
                          marginRight: 6,
                          transform: [
                            {
                              scale: navAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0.9, 1.3],
                              }),
                            },
                          ],
                        },
                      ]}
                    >
                      {steps.chambers && steps.soundscapes ? '✓' : '○'}
                    </Animated.Text>
                    <Text
                      style={[
                        Body.subtle,
                        {
                          fontFamily: 'Inter-ExtraLight',
                          color: '#EDEAF6',
                          fontSize: 13,
                          flexShrink: 1,
                        },
                      ]}
                    >
                      Swipe right or tap the left chevron for Soundscapes. Swipe left or tap the right chevron for Chambers.
                    </Text>
                  </View>
                </TouchableOpacity>
              </Animated.View>

              {/* Learning Hub step */}
              <Animated.View
                style={{
                  transform: [{ scale: isLearnActive ? 1.03 : 1 }],
                }}
              >
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={async () => {
                    if (!canClickLearn) return;
                    try { await Haptics.selectionAsync(); } catch {}
                    onLearnPress?.();
                  }}
                  style={{
                    borderRadius: 10,
                    backgroundColor: isLearnActive ? 'rgba(255,255,255,0.05)' : 'transparent',
                  }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 4,
                      paddingHorizontal: 6,
                      borderRadius: 10,
                    }}
                  >
                    <Animated.Text
                      style={[
                        Body.subtle,
                        {
                          fontFamily: 'Inter-ExtraLight',
                          fontSize: 13,
                          color: steps.learnHub
                            ? '#CFC3E0'
                            : (isLearnActive ? '#B5A9FF' : '#9B96B8'),
                          marginRight: 6,
                          transform: [
                            {
                              scale: learnAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0.9, 1.3],
                              }),
                            },
                          ],
                        },
                      ]}
                    >
                      {steps.learnHub ? '✓' : '○'}
                    </Animated.Text>
                    <Text
                      style={[
                        Body.subtle,
                        {
                          fontFamily: 'Inter-ExtraLight',
                          color: '#EDEAF6',
                          fontSize: 13,
                          flexShrink: 1,
                        },
                      ]}
                    >
                        Tap the ⌄ at the bottom or swipe up to open the Learning Hub.
                    </Text>
                  </View>
                </TouchableOpacity>
              </Animated.View>

              {/* Static hints (no live tracking yet) */}
              <Text style={[Body.subtle, { fontFamily: 'Inter-ExtraLight', color: '#EDEAF6', fontSize: 13 }]}>
                ○ Long-press the orb to reveal the Lunar Whisper.
              </Text>
              <Text style={[Body.subtle, { fontFamily: 'Inter-ExtraLight', color: '#EDEAF6', fontSize: 13 }]}>
                ○ Use ⚙︎ to set your name, intentions, and audio quality.
              </Text>
            </View>

            <View style={{ marginTop: 10, alignItems: 'center' }}>
  <TouchableOpacity
    onPress={async () => {
      try { await Haptics.selectionAsync(); } catch {}
      onStartTutorial();
    }}
    accessibilityRole="button"
    accessibilityLabel={tutorialMode ? 'Guided tour is active' : 'Start guided tour'}
  >
    <Text
      style={[
        Body.subtle,
        {
          fontFamily: 'Inter-ExtraLight',
          fontSize: 13,
          color: tutorialMode ? '#CFC3E0' : '#B5A9FF',
          textDecorationLine: 'underline',
        },
      ]}
    >
      {tutorialMode ? 'Guided tour is on' : 'Start guided tour'}
    </Text>
  </TouchableOpacity>
</View>

            <View style={{ height: 14 }} />
            <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 6 }}>
              <TouchableOpacity
                onPress={async () => { try { await Haptics.selectionAsync(); } catch {} onClose(); }}
                accessibilityRole="button"
                accessibilityLabel="Got it"
                style={{ backgroundColor: '#CFC3E0', paddingVertical: 8, paddingHorizontal: 20, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)' }}
              >
                <Text style={[Typography.subtle, { color: '#1F233A' }]}>Got it</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={async () => { try { await Haptics.selectionAsync(); } catch {} onDismissForever(); }}
                accessibilityRole="button"
                accessibilityLabel="Don't show again"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={{ color: '#F0EEF8', fontSize: 14, opacity: 0.9 }}>Don’t show again</Text>
              </TouchableOpacity>
            </View>
        </View>
    </View>
  );
}

export default function HomeScreen({ navigation, route }: any) {
  // --- DEBUG: visualize/tune orb hit area ---
  const DEBUG_ORB_HIT = false; // set to false to hide the debug ring
  const ORB_HIT_DIAMETER = 150;
  const ORB_HIT_OFFSET_X = 0; // tweak to nudge hit-area horizontally
  const ORB_HIT_OFFSET_Y = -30; // tweak to nudge hit-area vertically
  const portalScale = useRef(new Animated.Value(1)).current;
  // Shared breath (0 → exhale, 1 → inhale)
  const breath = useBreath();

  // Orb breath scale driven by shared breath
  const orbScale = breath.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1.15] });

  // Sigil base pulse (opacity + micro scale) driven by shared breath
  const sigilOpacityBase = breath.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1.0] });
  const sigilScaleBase   = breath.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1.10] });

  // Left/Right sigil values (kept same phase for cohesion)
  const sigilOpacityL = sigilOpacityBase;
  const sigilOpacityR = sigilOpacityBase;
  const sigilScaleL   = sigilScaleBase;
  const sigilScaleR   = sigilScaleBase;

  // Colored halo opacity (higher on inhale → richer color), diffuse halo (higher on exhale → softer/desaturated)
  const sigilColorOpacityL  = breath.interpolate({ inputRange: [0, 1], outputRange: [0.70, 1.00] });
  const sigilColorOpacityR  = breath.interpolate({ inputRange: [0, 1], outputRange: [0.70, 1.00] });
  const sigilDiffuseOpacityL = breath.interpolate({ inputRange: [0, 1], outputRange: [0.20, 0.10] }); // more diffuse on exhale
  const sigilDiffuseOpacityR = breath.interpolate({ inputRange: [0, 1], outputRange: [0.20, 0.10] });
  // Press feedback for orb (multiplies with breathing scale)
const portalPress = useRef(new Animated.Value(0)).current;
const portalPressScale = portalPress.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });

  // --- Embers / Inner Pulse unlock state ---
  const [emberState, setEmberState] = React.useState<EmberState | null>(null);
  const innerPulseUnlocked = !!emberState?.innerPulseUnlocked;

// --- Paywall Logic (reliable: present after Settings modal fully dismisses on iOS)
const [presentingPaywall, setPresentingPaywall] = React.useState(false);

// --- Debug: RevenueCat entitlement state (safe, no UI impact)
const ENTITLEMENT_ID = 'continuing_with_inner';

const logEntitlementState = useCallback(
  async (tag: string) => {
    try {
      const info = await Purchases.getCustomerInfo();
      const active = Object.keys(info?.entitlements?.active ?? {});
      const has = Boolean(info?.entitlements?.active?.[ENTITLEMENT_ID]);

      __DEV__ && console.log(
        `[RC][Entitlement] ${tag} → has=${has} active=${JSON.stringify(active)}`
      );
    } catch (e) {
      __DEV__ && console.log(`[RC][Entitlement] ${tag} → error`, e);
    }
  },
  []
);

const presentPaywall = React.useCallback(async () => {
  if (presentingPaywall) {
    __DEV__ && console.log('[PAYWALL] presentPaywall: already presenting, skipping');
    return;
  }

  try {
    setPresentingPaywall(true);

    await logEntitlementState('presentPaywall_start');
    __DEV__ && console.log('[PAYWALL] calling RevenueCatUI.presentPaywall()');
    const result = await RevenueCatUI.presentPaywall();
    __DEV__ && console.log('[PAYWALL] presentPaywall result:', result);
  } catch (e) {
    __DEV__ && console.log('[PAYWALL] Failed to present paywall:', e);
  } finally {
    await logEntitlementState('presentPaywall_end');
    setPresentingPaywall(false);
  }
}, [presentingPaywall, logEntitlementState]);

// Paywall from Settings: close Settings first, present paywall AFTER Modal fully dismisses.
// We use a ref so the Settings Modal's onDismiss can fire it reliably (no stale closures).
const paywallPendingRef = React.useRef(false);

const handleSettingsPaywall = useCallback(async () => {
  try { await Haptics.selectionAsync(); } catch {}
  await logEntitlementState('settings_cta_pressed');
  paywallPendingRef.current = true;
  setShowSettings(false);
  // Android: Modal.onDismiss doesn't fire, so use a timed fallback
  if (Platform.OS === 'android') {
    setTimeout(() => {
      if (paywallPendingRef.current) {
        paywallPendingRef.current = false;
        presentPaywall();
      }
    }, 350);
  }
}, [logEntitlementState, presentPaywall]);

// Called by <SettingsModal>'s onSettingsDismiss once iOS has finished the dismiss animation
const handleSettingsModalDismissed = useCallback(() => {
  if (paywallPendingRef.current) {
    paywallPendingRef.current = false;
    presentPaywall();
  }
}, [presentPaywall]);

  // Load Ember state once when Home mounts
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const state = await getEmberState();
        if (mounted) setEmberState(state);
      } catch (e) {
        __DEV__ && console.log('[Ember] initial load error', e);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // --- Ember derived totals + debug logger ---
  const totalEmbers = emberState?.totalEmbers ?? 0;
  const weeklyEmbers = emberState?.weeklyEmbers ?? 0;

  React.useEffect(() => {
    if (!emberState) return;
    __DEV__ && console.log('[Ember] Home state', {
      totalEmbers,
      weeklyEmbers,
      innerPulseUnlocked,
      lastWeeklyResetAt: emberState.lastWeeklyResetAt,
    });
  }, [emberState, totalEmbers, weeklyEmbers, innerPulseUnlocked]);

// --- Quick Calm (double-tap orb) ---
const [quickCalmVisible, setQuickCalmVisible] = React.useState(false);
const [quickCalmLine, setQuickCalmLine] = React.useState('One breath.');
const quickCalmOverlayOpacity = useRef(new Animated.Value(0)).current;
const quickCalmTextOpacity = useRef(new Animated.Value(0)).current;
const quickCalmTranslateY = useRef(new Animated.Value(28)).current;
const quickCalmOrbScale = useRef(new Animated.Value(1)).current;

const triggerQuickCalm = React.useCallback(async () => {
  // If a Quick Calm is already in progress, ignore further triggers
  if (quickCalmVisible) return;

  setQuickCalmVisible(true);

  // Soft, minimal lines — we’ll pick one per trigger
  const lines = [
    "You're here.",
    "The noise quiets.",
    "Peace returns.",
    "The field settles.",
    "The veil softens."
  ];
  const choice = lines[Math.floor(Math.random() * lines.length)] || 'One breath.';
  setQuickCalmLine(choice);

  quickCalmOverlayOpacity.setValue(0);
  quickCalmTextOpacity.setValue(0);
  quickCalmTranslateY.setValue(28);
  quickCalmOrbScale.setValue(1);

  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {}

  // --- Quick Calm breath sound ---
const breathSound = new Audio.Sound();
try {
  await breathSound.loadAsync(QUICKCALM_BREATH);
  await breathSound.setVolumeAsync(0.4); // gentle level
  // Start the breath just as the orb begins to swell
  try {
    await breathSound.replayAsync();
  } catch (e) {
    __DEV__ && console.log('[QuickCalm] replay error', e);
  }
} catch (e) {
  __DEV__ && console.log('[QuickCalm] load error', e);
}

  Animated.parallel([
    // Dim + soften the scene
    Animated.timing(quickCalmOverlayOpacity, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }),

    // Whisper text sequence
    Animated.sequence([
      Animated.delay(200),
      Animated.parallel([
        Animated.timing(quickCalmTextOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(quickCalmTranslateY, {
          toValue: -6,          // ends slightly above the starting line
          duration: 700,        // slower drift so it reads clearly
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(1800), // ← extended linger
      Animated.timing(quickCalmTextOpacity, {
        toValue: 0,
        duration: 600, // ← slower fade-out
        useNativeDriver: true,
      }),
    ]),

    // 🌬️ Orb inhale → exhale during Quick Calm
    Animated.sequence([
      // Inhale: grow to ~1.5x
      Animated.timing(quickCalmOrbScale, {
        toValue: 1.6,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      // Exhale: slowly settle back to 1.0 over the linger period
      Animated.timing(quickCalmOrbScale, {
        toValue: 1.0,
        duration: 3500, // ← slower, calmer exhale
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    ]),
    ]).start(async () => {
    // Melt the overlay back out
    Animated.timing(quickCalmOverlayOpacity, {
      toValue: 0,
      duration: 700, // ← slower melt-out
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(async () => {
      try { await breathSound.unloadAsync(); } catch {}
      setQuickCalmVisible(false);

      // 🌒 Each completed Quick Calm gently adds an Ember
      try {
        const state = await awardEmber('quickCalm');
        setEmberState(state);
      } catch (e) {
        __DEV__ && console.log('[Ember] award from QuickCalm failed', e);
      }
    });
  });
}, [
  quickCalmVisible,
  quickCalmOverlayOpacity,
  quickCalmTextOpacity,
  quickCalmTranslateY,
  quickCalmOrbScale,
  setEmberState,
]);

const isFocused = useIsFocused();

// --- Inner Pulse (heartbeat mode) ---
const [innerPulseEnabled, setInnerPulseEnabled] = React.useState(false);
const innerPulseValue = useRef(new Animated.Value(0)).current;

// Subtle heartbeat scale (small, but felt)
const innerPulseScale = innerPulseValue.interpolate({
  inputRange: [0, 1],
  outputRange: [0.97, 1.05],
});

// Persisted toggle: hydrate from storage when unlock state changes
React.useEffect(() => {
  let cancelled = false;
  (async () => {
    try {
      const stored = await AsyncStorage.getItem('innerPulse:enabled');
      if (cancelled) return;

      if (stored === '1') {
        setInnerPulseEnabled(true);
      } else if (stored === '0') {
        setInnerPulseEnabled(false);
      } else {
        // No preference saved yet → default to "on" only when unlocked
        setInnerPulseEnabled(!!innerPulseUnlocked);
      }
    } catch {
      if (!cancelled) {
        setInnerPulseEnabled(!!innerPulseUnlocked);
      }
    }
  })();
  return () => {
    cancelled = true;
  };
}, [innerPulseUnlocked]);

// Persist the toggle whenever it changes
React.useEffect(() => {
  AsyncStorage.setItem('innerPulse:enabled', innerPulseEnabled ? '1' : '0').catch(() => {});
}, [innerPulseEnabled]);

React.useEffect(() => {
  if (!innerPulseEnabled || !innerPulseUnlocked || !isFocused) {
    innerPulseValue.stopAnimation();
    innerPulseValue.setValue(0);
    return;
  }

  // Simple heartbeat: grow / relax / tiny pause, then loop
const loop = Animated.loop(
  Animated.sequence([
    // "lub": quick swell
    Animated.timing(innerPulseValue, {
      toValue: 1,
      duration: 360,              // was 420
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }),
    // "dub": settle back
    Animated.timing(innerPulseValue, {
      toValue: 0,
      duration: 360,              // was 520
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }),
    // tiny rest before the next beat
    Animated.delay(230),          // was 180
  ])
);

  loop.start();

  return () => {
    innerPulseValue.stopAnimation();
    innerPulseValue.setValue(0);
  };
}, [innerPulseEnabled, innerPulseUnlocked, isFocused, innerPulseValue]);

// When Inner Pulse is active and Home is focused, force-duck the hum so we can clearly hear its audio.
React.useEffect(() => {
  if (innerPulseEnabled && innerPulseUnlocked && isFocused) {
    __DEV__ && console.log('[InnerPulse] state-active → ducking hum from state effect');
    humRef.current?.setVolumeAsync(0.0).catch(() => {});
  }
}, [innerPulseEnabled, innerPulseUnlocked, isFocused]);
  
  const appStateRef = useRef<'active' | 'inactive' | 'background'>('active');
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const maybeStartHum = useCallback(async () => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (!isFocused || appStateRef.current !== 'active') return;

    try {
      await ensureHumLoaded();
      await humRef.current!.playAsync();
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (msg.includes('AudioFocusNotAcquiredException')) {
        // give Android a beat after coming to foreground, then try once
        retryTimerRef.current = setTimeout(async () => {
          if (isFocused && appStateRef.current === 'active') {
            try {
              await ensureHumLoaded();
              await humRef.current!.playAsync();
            } catch {}
          }
        }, 300);
      }
    }
  }, [ensureHumLoaded, isFocused]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      appStateRef.current = s as any;
      if (s !== 'active') {
        try { humRef.current?.pauseAsync(); } catch {}
      } else if (isFocused) {
        maybeStartHum();
      }
    });
    return () => sub.remove();
  }, [isFocused, maybeStartHum]);

  // Hint pulse anim for side arrows
  const leftHint = useRef(new Animated.Value(0)).current;
  const rightHint = useRef(new Animated.Value(0)).current;

  const runHint = useCallback((v: Animated.Value) => {
    v.setValue(0);
    Animated.sequence([
      Animated.timing(v, { toValue: 0.5, duration: 260, useNativeDriver: true }),
      Animated.timing(v, { toValue: 1, duration: 260, useNativeDriver: true }),
    ]).start(() => v.setValue(0));
  }, []);


  const leftHintOpacity = leftHint.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.85, 1, 0.85], // always visible, slightly brighter on pulse
  });
  const leftHintScale   = leftHint.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.5],
  });

  const rightHintOpacity = rightHint.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.85, 1, 0.85], // always visible, slightly brighter on pulse
  });
  const rightHintScale   = rightHint.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.5],
  });

  const [showPicker, setShowPicker] = React.useState(false);
  // Optional personal greeting from initiation
  const [profileName, setProfileName] = React.useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const v = await AsyncStorage.getItem('profileName');
        if (mounted) setProfileName(v);
      } catch {}
    })();
    return () => { mounted = false; };
  }, []);
  const [showSettings, setShowSettings] = React.useState(false);
  const dailySnapshot = useDailyPracticeSnapshot();


  // --- Home Helper walkthrough (first‑time guide) ---

  const {
    loading: homeWalkthroughLoading,
    shouldShow: shouldShowHomeHelper,
    markSeen: markHomeHelperSeen,
  } = useWalkthrough('home_helper_v1');
  const [showHomeHelp, setShowHomeHelp] = React.useState(false);
  const [homeSteps, setHomeSteps] = React.useState<HomeWalkSteps>({
    chambers: false,
    soundscapes: false,
    orb: false,
    learnHub: false,
  });
  const [activeStep, setActiveStep] = React.useState<HomeWalkStepId | null>(null);
  const [tutorialMode, setTutorialMode] = React.useState(false);

  // Walkthrough: only pulse chevrons when we're on the navigation step
  const isNavWalkStep = activeStep === 'chambers' || activeStep === 'soundscapes';

  // Walkthrough-driven hint pulses for side navigation (Phase 2A)
  useEffect(() => {
    // Only pulse while:
    // - Home is focused
    // - The helper modal is visible
    // - We’re on the navigation step of the walkthrough
    if (!isFocused || !showHomeHelp || !isNavWalkStep) {
      // Reset to a neutral state when not in nav step
      leftHint.stopAnimation();
      rightHint.stopAnimation();
      leftHint.setValue(0);
      rightHint.setValue(0);
      return;
    }

    // Kick off an initial pulse on both sides
    runHint(leftHint);
    runHint(rightHint);

    // Repeat every ~2 seconds while conditions stay true
    const interval = setInterval(() => {
      runHint(leftHint);
      runHint(rightHint);
    }, 1000);

    return () => {
      clearInterval(interval);
      leftHint.stopAnimation();
      rightHint.stopAnimation();
    };
  }, [isFocused, showHomeHelp, isNavWalkStep, runHint, leftHint, rightHint]);

  // Orb spotlight for walkthrough step
  const orbSpotlight = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    // Only run the spotlight when the helper is visible and we are on the orb step
    if (!showHomeHelp || activeStep !== 'orb') {
      orbSpotlight.stopAnimation();
      orbSpotlight.setValue(0);
      return;
    }

    const runPulse = () => {
      orbSpotlight.setValue(0);
      Animated.sequence([
        Animated.timing(orbSpotlight, {
          toValue: 1,
          duration: 600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(orbSpotlight, {
          toValue: 0,
          duration: 600,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished && showHomeHelp && activeStep === 'orb') {
          // small pause between pulses
          setTimeout(runPulse, 400);
        }
      });
    };

    runPulse();

    return () => {
      orbSpotlight.stopAnimation();
      orbSpotlight.setValue(0);
    };
  }, [showHomeHelp, activeStep, orbSpotlight]);
  React.useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(HOME_WALK_STEPS_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as Partial<HomeWalkSteps>;
        setHomeSteps(prev => ({
          chambers: parsed.chambers ?? prev.chambers,
          soundscapes: parsed.soundscapes ?? prev.soundscapes,
          orb: parsed.orb ?? prev.orb,
          learnHub: parsed.learnHub ?? prev.learnHub,
        }));
      } catch {
        // ignore restore errors, keep defaults
      }
    })();
  }, []);
  React.useEffect(() => {
    if (!showHomeHelp) return;
    const next = getFirstIncompleteStep(homeSteps);
    setActiveStep(next);
  }, [showHomeHelp, homeSteps]);
  // Helper: update step completion, persist progress, and auto-complete walkthrough when all are done
   const updateHomeStep = React.useCallback(
  (step: keyof HomeWalkSteps) => {
    setHomeSteps(prev => {
      const next: HomeWalkSteps = { ...prev, [step]: true };
      // persist progress so checkmarks survive navigation / remounts
      AsyncStorage.setItem(HOME_WALK_STEPS_KEY, JSON.stringify(next)).catch(() => {});
      const allDone = next.chambers && next.soundscapes && next.orb && next.learnHub;

      // Only auto-complete + hide when NOT in tutorial mode
      if (allDone && !tutorialMode) {
        try {
          markHomeHelperSeen();
        } catch {}
        setTimeout(() => {
          setShowHomeHelp(false);
        }, 900);
      }

      return next;
    });
  },
  [markHomeHelperSeen, tutorialMode]
);

  const handleOrbStepPress = React.useCallback(() => {
    updateHomeStep('orb');
  }, [updateHomeStep]);

  const handleNavStepPress = React.useCallback(() => {
    // Mark both nav-related steps as complete when the checklist row is tapped
    updateHomeStep('chambers');
    updateHomeStep('soundscapes');
  }, [updateHomeStep]);

  const handleLearnStepPress = React.useCallback(() => {
    updateHomeStep('learnHub');
  }, [updateHomeStep]);

  // --- Navigation helpers for walkthrough and swipes ---
  const completeHomeWalkthroughIfNeeded = useCallback(() => {
    if (showHomeHelp) {
      setShowHomeHelp(false);
    }
  }, [showHomeHelp]);

  const goToChambers = useCallback(async () => {
  // If the Home Helper is visible and the Chambers step isn't complete yet,
  // treat this interaction as fulfilling that walkthrough step instead of navigating away.
  if (showHomeHelp && !homeSteps.chambers) {
    updateHomeStep('chambers');
    try { await Haptics.selectionAsync(); } catch {}
    return;
  }

  completeHomeWalkthroughIfNeeded();
  updateHomeStep('chambers');
  try { await Haptics.selectionAsync(); } catch {}
  try { await fadeOutHum(); } catch {}
  navigation.navigate('Chambers');
}, [
  showHomeHelp,
  homeSteps.chambers,
  homeSteps.soundscapes,
  completeHomeWalkthroughIfNeeded,
  updateHomeStep,
  navigation,
  fadeOutHum,
]);

  const goToSoundscapes = useCallback(async () => {
  // If the Home Helper is visible and the Soundscapes step isn't complete yet,
  // treat this interaction as fulfilling that walkthrough step instead of navigating away.
  if (showHomeHelp && !homeSteps.soundscapes) {
    updateHomeStep('soundscapes');
    try { await Haptics.selectionAsync(); } catch {}
    return;
  }

  completeHomeWalkthroughIfNeeded();
  updateHomeStep('soundscapes');
  try { await Haptics.selectionAsync(); } catch {}
  try { await fadeOutHum(); } catch {}
  navigation.navigate('Soundscapes');
}, [
  showHomeHelp,
  homeSteps.chambers,
  homeSteps.soundscapes,
  completeHomeWalkthroughIfNeeded,
  updateHomeStep,
  navigation,
  fadeOutHum,
]);

const goToLearnHub = useCallback(async () => {
  __DEV__ && console.log(
    '[HOME] goToLearnHub called. showHomeHelp=',
    showHomeHelp,
    'learnHub step=',
    homeSteps.learnHub
  );

  // When the Home Helper is guiding the Learning Hub step, mark it complete but don't leave Home yet.
  if (showHomeHelp && !homeSteps.learnHub) {
    __DEV__ && console.log('[HOME] Completing LearnHub walkthrough step from goToLearnHub');
    try { await Haptics.selectionAsync(); } catch {}
    updateHomeStep('learnHub');
    return;
  }

  __DEV__ && console.log('[HOME] Navigating to LearnHub normally');
  try { await Haptics.selectionAsync(); } catch {}
  try { await fadeOutHum(); } catch {}
  navigation.navigate('LearnHub'); // if your route is named differently, keep the original name
}, [
  showHomeHelp,
  homeSteps.learnHub,
  updateHomeStep,
  navigation,
  fadeOutHum,
]);

  // Lunar Whisper modal (long‑press orb)
  const [showLunarModal, setShowLunarModal] = React.useState(false);
  // Simple open — SettingsModal handles its own init via useEffect(visible)
  const openSettings = useCallback(() => {
    setShowSettings(true);
  }, []);

  // First launch flag for greeting
  const [hasLaunched, setHasLaunched] = React.useState(false);
  useEffect(() => {
    (async () => {
      try {
        const seen = await AsyncStorage.getItem('hasLaunched');
        if (seen) {
          // returning user
          setHasLaunched(true);
        } else {
          // first launch in this install: greet as new (not "back"), but mark for next time
          await AsyncStorage.setItem('hasLaunched', '1');
          setHasLaunched(false);
        }
      } catch {
        // safe default: treat as first visit this session
        setHasLaunched(false);
      }
    })();
  }, []);
  // Show the Home helper on first launch via walkthrough hook
  useEffect(() => {
    if (homeWalkthroughLoading) return;
    if (shouldShowHomeHelper) {
      const t = setTimeout(() => setShowHomeHelp(true), 900); // let the screen settle
      return () => clearTimeout(t);
    }
  }, [homeWalkthroughLoading, shouldShowHomeHelper]);
  // Gate early orb render to avoid any brief ghosting during the screen swap
  const [veilGate, setVeilGate] = React.useState(!!route?.params?.fogStart);
  useEffect(() => {
    if (route?.params?.fogStart) {
      setVeilGate(true);
      const t = setTimeout(() => setVeilGate(false), 520);
      // Extra safety: ensure gate opens even if timers pause
      const t2 = setTimeout(() => setVeilGate(false), 1200);
      return () => { clearTimeout(t); clearTimeout(t2); };
    }
  }, [route?.params?.fogStart]);
  // Orb reveal dissolve (robust): always start at 1, then if veilGate opens, animate 0→1
  const orbReveal = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (veilGate) {
      // while the gate is closed, keep the orb fully hidden via the gate (opacity check below)
      orbReveal.stopAnimation();
      orbReveal.setValue(0);
    } else {
      // gate opened → melt in
      orbReveal.stopAnimation();
      orbReveal.setValue(0);
      Animated.timing(orbReveal, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }, [veilGate]);

  useEffect(() => {
    if (route?.params?.fogStart) {
      __DEV__ && console.log('[FOG] Home: seal boost start');
      (globalThis as any).__fog?.boost(0.15, 320);
    }
  }, [route?.params?.fogStart]);
  const [navigating, setNavigating] = React.useState(false);
  const lastJourneyKey = 'lastJourney';

  const startingRef = useRef(false);
  const [resumeLabel, setResumeLabel] = React.useState('My Journey');
  const [resumeSub, setResumeSub] = React.useState('');
  const [resumePct, setResumePct] = React.useState(0);
  const [suggestion, setSuggestion] = React.useState<Suggestion | null>(null);
  const [suggDismissed, setSuggDismissed] = React.useState(false);
  const todayKey = React.useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `suggestion:dismissed:${y}-${m}-${day}`;
  }, []);
  useEffect(() => {
    if (!suggestion) return;
    (async () => {
      try {
        const v = await AsyncStorage.getItem(todayKey);
        setSuggDismissed(!!v);
      } catch {
        setSuggDismissed(false);
      }
    })();
  }, [suggestion, todayKey]);

  const handleDismissSuggestion = useCallback(async () => {
    // subtle haptic to acknowledge the choice
    try { await Haptics.selectionAsync(); } catch {}

    try {
      Animated.parallel([
        Animated.timing(suggOpacity, {
          toValue: 0,
          duration: 800,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(suggTranslate, {
          toValue: -6,
          duration: 800,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(async () => {
        // small post-fade linger so the longer fade is perceived
        await new Promise(res => setTimeout(res, 240));
        setSuggDismissed(true);
        try { await AsyncStorage.setItem(todayKey, '1'); } catch {}
      });
    } catch {
      setSuggDismissed(true);
      try { await AsyncStorage.setItem(todayKey, '1'); } catch {}
    }
  }, [todayKey, suggOpacity, suggTranslate]);
  const suggOpacity = useRef(new Animated.Value(0)).current;
  const suggTranslate = useRef(new Animated.Value(-6)).current;
  const suggPress = useRef(new Animated.Value(0)).current;
  
  const suggPressScale = suggPress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.992],
  });
  
  const suggPressGlow = suggPress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const suggPressBorder = suggPress.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.14)'],
  });
  useEffect(() => {
    (async () => {
      try {
        const s = await getTodaySuggestion(CHAMBERS, SOUNDSCAPES, LESSONS);
        setSuggestion(s);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    if (!suggestion) return;
    // reset & fade/slide in
    suggOpacity.setValue(0);
    suggTranslate.setValue(-6);
    Animated.parallel([
      Animated.timing(suggOpacity, {
        toValue: 1,
        duration: 700,
        delay: 1000,
        useNativeDriver: true,
      }),
      Animated.timing(suggTranslate, {
        toValue: 0,
        duration: 700,
        delay: 1000,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [suggestion, suggOpacity, suggTranslate]);

  const handleStartSuggestion = useCallback(async () => {
    if (!suggestion || startingRef.current) return;
    startingRef.current = true;

    // gentle haptic tick on start
    try { await Haptics.selectionAsync(); } catch {}

    // fade background hum first
    try { await fadeOutHum(); } catch {}

    // Fade the card out more slowly, then pause briefly so the fade is actually perceived before navigation kicks in
    Animated.parallel([
      Animated.timing(suggOpacity, { toValue: 0, duration: 800, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(suggTranslate, { toValue: -6, duration: 800, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start(async () => {
      // small post-fade linger so the longer fade reads
      await new Promise(res => setTimeout(res, 240));
      startFromSuggestion(suggestion, navigation);
      // allow future starts after we leave this screen; safe reset
      setTimeout(() => { startingRef.current = false; }, 1000);
    });
  }, [suggestion, navigation, suggOpacity, suggTranslate]);

  // Intentions (global)
  const { intentions, label: intentionLabel, theme } = useIntention();
  __DEV__ && console.log('[INTENTION] label=', intentionLabel);
  __DEV__ && console.log('[INTENTION] raw=', intentions);
  // Derive intention-based aura colors (fallbacks if none)
  const auraColors = React.useMemo(() => computeAuraColors(intentions), [intentions?.join('|')]);
  const auraLocations = [0, 1];
  // Debug effect: log what the component sees at runtime
  useEffect(() => {
    __DEV__ && console.log('[AURA] intentions=', intentions, '→ colors=', auraColors);
  }, [intentions, auraColors]);

  // Ritual-style affirmations per intention
  const AFFIRMATIONS: Record<string, string[]> = {
    calm: [
      'The tide of stillness carries you inward.',
      'All is quiet within the sanctum of your being.',
    ],
    clarity: [
      'Your inner sky clears—truth shines without distortion.',
      'Every breath opens space for clear vision.',
    ],
    grounding: [
      'Your roots sink deep into the eternal earth.',
      'Stillness anchors you to what is real and true.',
    ],
    healing: [
      'Every breath restores your body, your heart, your light.',
      'Gentle currents wash away what no longer serves you.',
    ],
    reawakening: [
      'The flame within rises again, radiant and unafraid.',
      'You remember yourself beyond the noise of the world.',
    ],
    expansion: [
      'The horizon opens—your spirit moves without limit.',
      'You are vast, endless, and free.',
    ],
  };

  // Rotate which line we show each day (keeps it fresh but not random-chaotic)
  const variantIndex = React.useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const dayOfYear = Math.floor((+now - +start) / 86400000); // 0..365
    return dayOfYear % 2; // pick index 0 or 1
  }, []);

  // Choose up to two lines: one for each selected intention (if present)
  const ritualLines: string[] = [];
  if (intentions && intentions.length > 0) {
    const first = intentions[0];
    const second = intentions[1];
    if (first && AFFIRMATIONS[first]) {
      const line = AFFIRMATIONS[first][variantIndex] ?? AFFIRMATIONS[first][0];
      ritualLines.push(line);
    }
    if (second && AFFIRMATIONS[second]) {
      const line = AFFIRMATIONS[second][variantIndex] ?? AFFIRMATIONS[second][0];
      ritualLines.push(line);
    }
  }

  // Ambient hum sound ref
  const humRef = useRef<Audio.Sound | null>(null);
  // Inner Pulse heartbeat sound ref + loading guard
  const innerPulseSoundRef = useRef<Audio.Sound | null>(null);
  const innerPulseLoadingRef = useRef<boolean>(false);

  const ensureHumLoaded = useCallback(async () => {
    try {
      if (!humRef.current) {
        humRef.current = new Audio.Sound();
      }
      const status = await humRef.current.getStatusAsync().catch(() => null as any);
      if (!status || !('isLoaded' in status) || !status.isLoaded) {
        await humRef.current.loadAsync(require('../assets/audio/Homepage_Hum.mp3'));
        await humRef.current.setIsLoopingAsync(true);
        await humRef.current.setVolumeAsync(0.15);
      }
    } catch (e) {
      __DEV__ && console.log('ensureHumLoaded error', e);
    }
  }, []);

  // Load / play / pause the Inner Pulse heartbeat loop
  useEffect(() => {
    let cancelled = false;

    const ensureInnerPulseSound = async () => {
      // Log current flags so we can see what the effect believes at runtime
      __DEV__ && console.log(
        '[InnerPulse] ensureInnerPulseSound called',
        'enabled=', innerPulseEnabled,
        'unlocked=', innerPulseUnlocked,
        'focused=', isFocused
      );

      // If we can't or shouldn't hear it right now, pause and restore hum, then bail
      if (!innerPulseUnlocked || !innerPulseEnabled || !isFocused) {
        if (innerPulseSoundRef.current) {
          __DEV__ && console.log('[InnerPulse] pausing heartbeat loop (not unlocked / not enabled / not focused)');
          try {
            await innerPulseSoundRef.current.pauseAsync();
          } catch {}
        }
        try {
          await humRef.current?.setVolumeAsync(0.35);
        } catch {}
        return;
      }

      if (innerPulseLoadingRef.current) {
        // Another load is already in progress; don't start a second one.
        return;
      }

      try {
        if (!innerPulseSoundRef.current) {
          innerPulseSoundRef.current = new Audio.Sound();
        }

        // Check current status
        let status = await innerPulseSoundRef.current
          .getStatusAsync()
          .catch(() => null as any);
        __DEV__ && console.log('[InnerPulse] pre-load status =', status);

        // Load if needed
        if (!status || !('isLoaded' in status) || !status.isLoaded) {
          innerPulseLoadingRef.current = true;
          try {
            await innerPulseSoundRef.current.loadAsync(
              require('../assets/audio/inner_pulse_heartbeat_v1.m4a')
            );
            await innerPulseSoundRef.current.setIsLoopingAsync(true);
          } finally {
            innerPulseLoadingRef.current = false;
          }
          try {
            status = await innerPulseSoundRef.current.getStatusAsync();
            __DEV__ && console.log('[InnerPulse] post-load status =', status);
          } catch {}
        }

        if (cancelled) return;

        // At this point the sound should be loaded; aggressively restart it from 0.
        try {
          await innerPulseSoundRef.current.setVolumeAsync(1.0); // TEMP: max volume for tuning
        } catch {}

        try {
          // Ensure we always restart from the beginning and actually play.
          await innerPulseSoundRef.current.stopAsync().catch(() => {});
          await innerPulseSoundRef.current.setPositionAsync(0);
          __DEV__ && console.log('[InnerPulse] starting heartbeat loop (replay from 0)');
          await innerPulseSoundRef.current.playAsync();
        } catch (e) {
          __DEV__ && console.log('[InnerPulse] play error', e);
        }

        try {
          const afterPlay = await innerPulseSoundRef.current.getStatusAsync();
          __DEV__ && console.log('[InnerPulse] status after play =', afterPlay);
        } catch {}

        // Drop the hum while the heartbeat is active so it can be clearly heard
        try {
          await humRef.current?.setVolumeAsync(0.0);
        } catch {}
      } catch (e: any) {
        const msg = String(e?.message || e);
        if (msg.includes('already loading')) {
          // benign race: another load is in progress; ignore
          return;
        }
        __DEV__ && console.log('[InnerPulse] sound error', e);
      }
    };

    ensureInnerPulseSound();

    return () => {
      cancelled = true;
    };
  }, [innerPulseEnabled, innerPulseUnlocked, isFocused]);

  // Ensure audio plays politely (silent mode iOS, duck others on Android)
  useEffect(() => {
    Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      interruptionModeIOS: Audio.INTERRUPTION_MODE_IOS_DO_NOT_MIX,
      interruptionModeAndroid: Audio.INTERRUPTION_MODE_ANDROID_DO_NOT_MIX,
    }).catch(() => {});
  }, []);

  const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
  // --- Swipe navigation gesture (edge-aware) ---
  const SWIPE_THRESHOLD = Math.max(60, SCREEN_W * 0.12); // ~12% of screen width
  const EDGE_GUARD = 16; // smaller edge guard so center swipes register
  const startXRef = useRef(0);

  // Disable swipes while any modal/overlay is visible (including the Home walkthrough)
  const gesturesDisabled =
    showSettings || showPicker || showLunarModal || showHomeHelp;

    // Prevent double-firing when we trigger during update
    const panHandledRef = useRef(false);
    // Edge-aware horizontal swipe to navigate between tabs
const pan = useMemo(
  () =>
    Gesture.Pan()
      .enabled(!gesturesDisabled)
      .runOnJS(true)
      .activeOffsetX([-10, 10]) // slightly easier to activate horizontal intent
      .failOffsetY([-16, 16])   // allow a bit more vertical drift before failing
      .minDistance(10)
      .onStart((e) => {
        // Store where the gesture began so we can edge‑guard vs Android back swipe
        // Pan gesture events include absoluteX directly
        // @ts-ignore - RNGH event typing varies across minor versions
        startXRef.current = (e as any).absoluteX ?? 0;
        __DEV__ && console.log('[PAN] started at X:', startXRef.current);
      })
      .onUpdate(async (e) => {
        if (panHandledRef.current) return;
        // @ts-ignore - RNGH pan event exposes translationX
        const dx = (e as any).translationX ?? 0; // + right, - left
        __DEV__ && console.log('[PAN] dx:', dx);
        const startX = startXRef.current || 0;
        // Guard edges each frame too
        if (startX < EDGE_GUARD || startX > SCREEN_W - EDGE_GUARD) return;
        if (dx <= -SWIPE_THRESHOLD) {
          panHandledRef.current = true;
          __DEV__ && console.log('[PAN] navigating → Chambers');
          goToChambers();
        } else if (dx >= SWIPE_THRESHOLD) {
          panHandledRef.current = true;
          __DEV__ && console.log('[PAN] navigating → Soundscapes');
          goToSoundscapes();
        }
      })
      .onEnd(async (e) => {
        __DEV__ && console.log('[PAN] ended with dx:', (e as any).translationX);
        // @ts-ignore - RNGH pan end event exposes absoluteX/translationX
        const absX = (e as any).absoluteX ?? 0;
        // @ts-ignore
        const dx = (e as any).translationX ?? 0; // + right, - left
        const startX = startXRef.current || absX;
        if (panHandledRef.current) { panHandledRef.current = false; return; }
        // Guard Android back gesture edges
        if (startX < EDGE_GUARD || startX > SCREEN_W - EDGE_GUARD) return;

        if (dx <= -SWIPE_THRESHOLD) {
          __DEV__ && console.log('[PAN] navigating → Chambers');
          goToChambers();
          return;
        }
        if (dx >= SWIPE_THRESHOLD) {
          __DEV__ && console.log('[PAN] navigating → Soundscapes');
          goToSoundscapes();
          return;
        }
      })
      .onFinalize(() => { panHandledRef.current = false; }),
  [gesturesDisabled, SCREEN_W, goToChambers, goToSoundscapes]
);

  // Fallback short-gesture detection (fling) in case Pan is being intercepted by RN scroll responders
  const flingLeft = useMemo(
    () =>
      Gesture.Fling()
        .enabled(!gesturesDisabled)
        .runOnJS(true)
        .direction(Directions.LEFT)
        .numberOfPointers(1)
        .onStart(async (e) => {
          __DEV__ && console.log('[FLING LEFT] triggered');
          // @ts-ignore
          const absX = (e as any).absoluteX ?? 0;
          if (absX > 0 && (absX < EDGE_GUARD || absX > SCREEN_W - EDGE_GUARD)) return; // respect edge guard
          __DEV__ && console.log('[FLING LEFT] navigating → Chambers');
          goToChambers();
        }),
    [gesturesDisabled, SCREEN_W, goToChambers]
  );

  const flingRight = useMemo(
    () =>
      Gesture.Fling()
        .enabled(!gesturesDisabled)
        .runOnJS(true)
        .direction(Directions.RIGHT)
        .numberOfPointers(1)
        .onStart(async (e) => {
          __DEV__ && console.log('[FLING RIGHT] triggered');
          // @ts-ignore
          const absX = (e as any).absoluteX ?? 0;
          if (absX > 0 && (absX < EDGE_GUARD || absX > SCREEN_W - EDGE_GUARD)) return;
          __DEV__ && console.log('[FLING RIGHT] navigating → Soundscapes');
          goToSoundscapes();
        }),
    [gesturesDisabled, SCREEN_W, goToSoundscapes]
  );

  const flingUp = useMemo(
  () =>
    Gesture.Fling()
      .enabled(!gesturesDisabled)
      .runOnJS(true)
      .direction(Directions.UP)
      .numberOfPointers(1)
      .onStart(async (e) => {
        __DEV__ && console.log('[FLING UP] triggered');
        await goToLearnHub();
      }),
  [gesturesDisabled, goToLearnHub]
);

  // Combine pan + fling; whichever recognizes first will win
  const rootGesture = useMemo(
  () => Gesture.Race(pan, Gesture.Exclusive(flingLeft, flingRight), flingUp),
  [pan, flingLeft, flingRight, flingUp]
);
  // Some Android devices (gesture nav, certain emulators) report a smaller `window` height than the full
  // device screen. Use `screen` height to compute any extra space below the window and bleed the BG into it.
  const { height: DEVICE_SCREEN_H } = Dimensions.get('screen');
  const NAV_FUDGE = Math.max(0, DEVICE_SCREEN_H - SCREEN_H);
  // Aspect profile — treat wide (short AR) devices slightly differently for orb sizing/placement
  const AR = SCREEN_H / SCREEN_W;
  const isWide = AR < 1.95;       // e.g., Galaxy Ultra–class, custom wide emulators
  const isTall = AR > 2.10;       // very tall phones (Edge/Xperia–like)

  // Treat larger-width devices (e.g., iPads / tablets) differently for hero sizing.
  // This is a simple breakpoint off logical width and AR so it stays platform-agnostic.
  const isTablet = SCREEN_W >= 768 && AR < 1.9;

  // On wider or large-width devices, the orb tweaks can visually lift the sigils.
  // Add a stronger downward offset so they sit closer to the orb base.
  const isLargeW = SCREEN_W >= 420; // wide dp threshold (e.g., Pixel Pro / Galaxy Ultra class)
  const SIGIL_Y_PROFILE_TWEAK = (isWide || isLargeW) ? 40 : 0; // move sigils down ~40px on wide/large screens

  // Resolve intrinsic size from the bundled background asset (no hardcoded dims)
  const BG_ASSET = require('../assets/images/home_arch_bg_v2.webp');
  const SIGIL_JOURNAL = require('../assets/sigils/journal_button.png');
  const SIGIL_COMMUNITY = require('../assets/sigils/community_button.png');
  const HALO_LAVENDER = require('../assets/sigils/sigil_halo_lavender.png');
  const HALO_GOLD = require('../assets/sigils/sigil_halo_gold.png');
  const HALO_DIFFUSE = require('../assets/sigils/sigil_halo_diffuse.png');
  // Lunar Whisper: two-sprite swap (default orb ⇄ moon-phase orb)
  const DEFAULT_ORB_SRC = require('../assets/images/orb-enhanced.png');
const QUICKCALM_BREATH = require('../assets/audio/quickcalm_breath_v1_mastered.m4a');
  // --- Threshold Moment (post-chamber / ritual acknowledgment) ---
  const [thresholdLine, setThresholdLine] = React.useState<string | null>(null);
  const thresholdOpacity = useRef(new Animated.Value(0)).current;
  __DEV__ && console.log('[QuickCalm] asset id =', QUICKCALM_BREATH);
  // Glow padding for halo images
  const GLOW_PAD = 18;
  const BG_SRC = Image.resolveAssetSource(BG_ASSET);
  const BG_W = BG_SRC?.width ?? 2048;
  const BG_H = BG_SRC?.height ?? 3072;

  // Enable/disable Lunar Whisper (later can come from Settings)
  const lunarEnabled = true;
  // Timed sprite swap (preloads default + current phase)
  const { currentSrc: orbCurrentSrc, phase: orbPhase, showMoon: orbShowMoon } = useLunarWhisper({
    defaultSrc: DEFAULT_ORB_SRC,
    enabled: lunarEnabled,
    minIntervalMs: 30_000,
    maxIntervalMs: 90_000,
    showDurationMs: 3_000,
  });
  // Stable moon overlay source (do not depend on showMoon so fade-out can complete)
  const moonOverlaySrc = orbMoonImages[orbPhase];
  // Moon overlay alpha (base orb remains fully visible; we only fade the moon layer)
  const orbSwapAlpha = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    // Only trigger the sequence when the moon whisper starts.
    if (!orbShowMoon) return;
    orbSwapAlpha.stopAnimation();
    orbSwapAlpha.setValue(0);
    Animated.sequence([
      Animated.timing(orbSwapAlpha, {
        toValue: 1,
        duration: 800,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.delay(1000),
      Animated.timing(orbSwapAlpha, {
        toValue: 0,
        duration: 1200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [orbShowMoon]);
  // Edge-to-edge sizing (fill the entire screen, behind system UI)
  const insets = useSafeAreaInsets();
  const SAFE_W = SCREEN_W;
  const SAFE_H = SCREEN_H;

  // Full-bleed cover inside the entire screen (no top/bottom gaps)
  const BG_FIT: 'contain' | 'cover' = 'cover';
  const BG_BOX_W = SCREEN_W;
  // Bleed under status + nav bars and into any extra area not included in `window` height
  const BG_BOX_H = SCREEN_H + insets.top + insets.bottom + NAV_FUDGE + 12; // +12px cushion to ensure no edge seams
  const BG_BOX_LEFT = 0;
  const BG_BOX_TOP = -insets.top;

  const HERO_MIN = Math.max(300, SCREEN_H - 480); // ensures CTA sits near bottom of first viewport

  // Orb anchored inside the background box — baseline tuned for Pixel 7, with gentle AR-based tweaks
  // Orb anchored inside the background box — baseline tuned for phones, with tablet tweaks
const ORB_SIZE_PCT = isTablet ? 0.18 : (isWide ? 0.315 : 0.300);

// ORIGINAL placement for phones (before tablet tweak)
const ORB_Y_OFFSET_PHONE = -60;

// Updated placement for tablets (the one you said looks great)
const ORB_Y_OFFSET_TABLET = -90;

// Apply device-appropriate offset
const ORB_Y_OFFSET = isTablet ? ORB_Y_OFFSET_TABLET : ORB_Y_OFFSET_PHONE;

const ORB_WIDTH = BG_BOX_W * ORB_SIZE_PCT;
const ORB_LEFT  = BG_BOX_LEFT + BG_BOX_W * 0.499 - ORB_WIDTH / 2;
const ORB_TOP   = BG_BOX_TOP + BG_BOX_H * 0.461 - ORB_WIDTH / 2 + ORB_Y_OFFSET;

  // Sigils: placed symmetrically below the orb base, sized relative to bg width
  const SIGIL_SIZE_PCT = isTablet ? 0.085 : 0.11; // slightly smaller on tablets
  const SIGIL_SIZE = BG_BOX_W * SIGIL_SIZE_PCT;

  // Vertical placement near the orb base
  const SIGIL_CENTER_Y = ORB_TOP + ORB_WIDTH * 0.95;

  // Horizontal centers (symmetry around orb center ~0.499)
  const SIGIL_LEFT_CENTER_X  = BG_BOX_LEFT + BG_BOX_W * 0.34;
  const SIGIL_RIGHT_CENTER_X = BG_BOX_LEFT + BG_BOX_W * 0.66;

  // Convert centers to top-left for absolute positioning (adjusted positions)
  const SIGIL_LEFT_LEFT  = SIGIL_LEFT_CENTER_X  - SIGIL_SIZE / 2 - 15;  // moved 15px left
  const SIGIL_LEFT_TOP   = SIGIL_CENTER_Y       - SIGIL_SIZE / 2 + 50 + SIGIL_Y_PROFILE_TWEAK;   // downshift on wide/large
  const SIGIL_RIGHT_LEFT = SIGIL_RIGHT_CENTER_X - SIGIL_SIZE / 2 + 15;  // moved 15px right
  const SIGIL_RIGHT_TOP  = SIGIL_CENTER_Y       - SIGIL_SIZE / 2 + 50 + SIGIL_Y_PROFILE_TWEAK;   // downshift on wide/large

  // Welcome message fade-up
  const msgOpacity = useRef(new Animated.Value(0)).current;
  const msgTranslate = useRef(new Animated.Value(10)).current; // starts slightly lower

  // Top intention header fade/slide (appears after a short delay)
  const topAffOpacity = useRef(new Animated.Value(0)).current;
  const topAffTranslate = useRef(new Animated.Value(-6)).current;

  // Shimmer for "My Journey" button
  const shimmerX = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const run = () => {
      shimmerX.setValue(0);
      Animated.timing(shimmerX, {
        toValue: 1,
        duration: 5200,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        setTimeout(run, 1000);
      });
    };
    run();
    return () => shimmerX.stopAnimation();
  }, [shimmerX]);

  // Scroll-driven depth (0 = outer sanctum → 1 = deeper chamber)
  const scrollY = useRef(new Animated.Value(0)).current;
  const depth = scrollY.interpolate({ inputRange: [0, 240], outputRange: [0, 1], extrapolate: 'clamp' });

  // Parallax/attenuation for orb as you descend
  const orbParallaxScale = scrollY.interpolate({ inputRange: [0, 200], outputRange: [1, 0.98], extrapolate: 'clamp' });
  const orbParallaxOpacity = scrollY.interpolate({ inputRange: [0, 200], outputRange: [1, 0.92], extrapolate: 'clamp' });

  // Dust dims slightly with depth
  const dustOpacity = depth.interpolate({ inputRange: [0, 1], outputRange: [0.26, 0.16] });

  // Vignette deepens with chamber depth
  const vignetteOpacity = depth.interpolate({ inputRange: [0, 1], outputRange: [0.14, 0.42] });


  // Tap feedback for sigils (multiplies with idle pulse)
  const sigilPressL = useRef(new Animated.Value(0)).current;
  const sigilPressR = useRef(new Animated.Value(0)).current;
  const sigilPressScaleL = sigilPressL.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] });
  const sigilPressScaleR = sigilPressR.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] });

  // Smoothly reduce hum volume as user descends (depth 0->1 maps 0.50 -> 0.35),
// but keep it dropped when Inner Pulse is active so the heartbeat can be heard.
useEffect(() => {
  const listenerId = scrollY.addListener(({ value }) => {
    // If Inner Pulse is currently active and can be heard,
    // don't touch the hum volume here.
    if (innerPulseEnabled && innerPulseUnlocked && isFocused) {
      return;
    }

    const d = Math.max(0, Math.min(1, value / 240));
    const vol = 0.50 - 0.15 * d;
    humRef.current?.setVolumeAsync(vol).catch(() => {});
  });

  return () => scrollY.removeListener(listenerId);
}, [scrollY, innerPulseEnabled, innerPulseUnlocked, isFocused]);

  // Preload key imagery to avoid first-frame delay
  useEffect(() => {
    Asset.fromModule(BG_ASSET).downloadAsync();
    Asset.fromModule(SIGIL_JOURNAL).downloadAsync();
    Asset.fromModule(SIGIL_COMMUNITY).downloadAsync();
    Asset.fromModule(HALO_LAVENDER).downloadAsync();
    Asset.fromModule(HALO_GOLD).downloadAsync();
    Asset.fromModule(HALO_DIFFUSE).downloadAsync();
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          await loadResumeInfo();
          // Threshold Moments: check for a queued line and display it once
          try {
            const pendingKey = 'inner.threshold.pendingLine.v1';

            // Density-aware dwell + TimeEngine handshake helpers
            const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
            const computeThresholdDwellMs = (line: string, meta?: { id?: string | null; source?: string | null }) => {
              const text = (line || '').trim();
              const chars = text.length;
              const words = text.length ? text.split(/\s+/).filter(Boolean).length : 0;

              // Readability-driven dwell: base + per-word + per-char
              // (intentionally generous because this is a rare, “you notice it” moment)
              const base = 1600;
              const perWord = 85;
              const perChar = 10;
              let ms = base + words * perWord + chars * perChar;

              // Big-moment linger (TimeEngine id handshake)
              const id = (meta?.id || '').toString();
              const isBigMoment = (() => {
                // Examples: streak.21, return.after_21, return.after_30
                if (!id) return false;
                if (id.startsWith('streak.')) {
                  const n = Number(id.split('.')[1]);
                  return Number.isFinite(n) && n >= 14;
                }
                if (id.includes('after_')) {
                  const m = id.match(/after_(\d+)/);
                  const n = m ? Number(m[1]) : NaN;
                  return Number.isFinite(n) && n >= 14;
                }
                return false;
              })();
              if (isBigMoment) ms += 900;

              // Clamp so it never feels intrusive
              return clamp(ms, 2400, 5600);
            };

            // ThresholdEngine handshake: on arriving Home, allow a deferred moment to be queued.
            // // (This will no-op most of the time, and it will respect your “sometimes don’t fire” rules.)
            try {
                await ThresholdEngine.maybeQueueThreshold({ event: { type: 'app_open' } });
            } catch {}

            // Highest priority: queued threshold line (e.g., from JourneyPlayer completion)
            // Back-compat: may be a raw string OR a JSON payload: { line, id?, source? }
            const raw = await AsyncStorage.getItem(pendingKey);
            let queued: { line: string; id?: string; source?: string } | null = null;

            if (raw) {
              // Remove immediately so it only ever shows once
              await AsyncStorage.removeItem(pendingKey);

              const trimmed = raw.trim();
              if (trimmed.startsWith('{')) {
                try {
                  const parsed = JSON.parse(trimmed);
                  if (parsed && typeof parsed.line === 'string') {
                    queued = {
                      line: parsed.line,
                      id: typeof parsed.id === 'string' ? parsed.id : undefined,
                      source: typeof parsed.source === 'string' ? parsed.source : 'queued',
                    };
                  }
                } catch {
                  // fall through to treat it as a string below
                }
              }

              // If JSON parse failed or it wasn't JSON, treat as raw line
              if (!queued) {
                queued = { line: trimmed, source: 'queued' };
              }
            }

            // Begin with queued line if present
            let lineToShow: string | null = queued?.line || null;

            // DEV override — force a line so you can see the overlay in action.
            // lineToShow = 'The veil softens.';

            // Fallback: if nothing is queued, allow TimeEngine to surface a time-based threshold
            // Handshake: capture `res.id` so Home can “linger” on big moments.
            let timeId: string | null = null;
            if (!lineToShow) {
              try {
                // TimeEngine.tick returns a structured result (and may be async)
                const res: any = await TimeEngine.tick();

                // Preferred path: structured result
                const maybeLine = typeof res?.line === 'string' ? res.line : null;
                if (typeof res?.id === 'string') timeId = res.id;

                // Back-compat: if an older tick() returns a string directly
                const legacyLine = typeof res === 'string' ? res : null;

                const next = (maybeLine || legacyLine || '').trim();
                if (next.length > 0) {
                  lineToShow = next;
                }
              } catch (e) {
                __DEV__ && console.log('[TimeEngine] tick error', e);
              }
            }

            if (lineToShow && !cancelled) {
              const dwellMs = computeThresholdDwellMs(lineToShow, {
                id: queued?.id || timeId,
                source: queued?.source || (timeId ? 'time' : null),
              });

              setThresholdLine(lineToShow);

              thresholdOpacity.setValue(0);
              Animated.sequence([
                Animated.timing(thresholdOpacity, {
                  toValue: 1,
                  duration: 400,
                  useNativeDriver: true,
                }),
                // ↑ fade-in
                Animated.delay(dwellMs),
                Animated.timing(thresholdOpacity, {
                  toValue: 0,
                  duration: 1000, // melt-out
                  useNativeDriver: true,
                }),
              ]).start(() => {
                setThresholdLine(null);
              });
            }
          } catch (e) {
            __DEV__ && console.log('[Threshold] home display error', e);
          }
          if (!cancelled && appStateRef.current === 'active') {
            await maybeStartHum();
          }
        } catch (e) {
          __DEV__ && console.log('Hum load/play error', e);
        }
      })();

      return () => {
        cancelled = true;
        humRef.current?.pauseAsync().catch(() => {});
      };
    }, [maybeStartHum, loadResumeInfo])
  );

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      const checkDaily = async () => {
        try {
          const show = await shouldShowDailyMicroRitual();
          if (!cancelled && show) {
            // fade out Home hum before jumping into the ritual
            try { await fadeOutHum(); } catch {}
            navigation.navigate('DailyRitual');
          }
        } catch (e) {
          __DEV__ && console.log('[HOME] daily micro check error', e);
        }
      };

      checkDaily();

      return () => {
        cancelled = true;
      };
    }, [navigation])
  );

   useEffect(() => () => {
    humRef.current?.unloadAsync().catch(() => {});
    innerPulseSoundRef.current?.unloadAsync().catch(() => {});
    if (orbTapTimeoutRef.current) {
      clearTimeout(orbTapTimeoutRef.current);
      orbTapTimeoutRef.current = null;
    }
  }, []);

  // Fade/slide in the welcome message on mount
  useEffect(() => {
    Animated.parallel([
      Animated.timing(msgOpacity, {
        toValue: 1,
        duration: 800,
        delay: 250,
        useNativeDriver: true,
      }),
      Animated.timing(msgTranslate, {
        toValue: 0,
        duration: 800,
        delay: 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Reveal the intention header after a brief pause (ritual beat)
  useEffect(() => {
    const hasIntention = !!(intentions && intentions.length > 0);
    if (hasIntention) {
      topAffOpacity.setValue(0);
      topAffTranslate.setValue(-6);
      Animated.parallel([
        Animated.timing(topAffOpacity, {
          toValue: 1,
          duration: 4000,
          delay: 2000, // ~2s after screen enters
          useNativeDriver: true,
        }),
        Animated.timing(topAffTranslate, {
          toValue: 0,
          duration: 700,
          delay: 2000,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // reset when no intentions
      topAffOpacity.setValue(0);
      topAffTranslate.setValue(-6);
    }
  }, [intentions, topAffOpacity, topAffTranslate]);


  // Fade the ambient hum before navigating into a Journey / Library
  const fadeOutHum = useCallback(async () => {
    try {
      const s = humRef.current;
      if (!s) return;
      const st = await s.getStatusAsync().catch(() => null as any);
      if (!st || !('isLoaded' in st) || !st.isLoaded) return;
      await s.setVolumeAsync(0);
      await s.pauseAsync();
    } catch (e) {
      __DEV__ && console.log('Hum fade/pause error', e);
    }
  }, []);

  const handleChangeIntentions = useCallback(async () => {
  // Soft tick to confirm the tap
  try {
    await Haptics.selectionAsync();
  } catch {}

  // Close the settings modal first so the transition feels clean
  setShowSettings(false);

  // Tiny delay so the modal has time to dismiss before we move screens
  setTimeout(async () => {
    try {
      await fadeOutHum(); // keep things consistent with other nav
    } catch {}

    // ⬇️ Use whatever route name you actually use for your intentions flow
    // e.g. 'Essence', 'Intentions', 'OnboardingIntentions', etc.
    navigation.navigate('Intention', { fromSettings: true });
  }, 220);
}, [fadeOutHum, navigation, setShowSettings]);

  const getLastJourney = async () => {
    try {
      const raw = await AsyncStorage.getItem(lastJourneyKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };


  const saveLastJourney = async (journey: { id: string; chamber?: string }) => {
    try { await AsyncStorage.setItem(lastJourneyKey, JSON.stringify(journey)); } catch {}
  };

const handleOrbTap = async () => {
  __DEV__ && console.log('[HOME] Orb tapped');
  // Walkthrough handling: if we're on the orb step, mark it complete
  const inOrbWalkthroughStep = showHomeHelp && activeStep === 'orb';
  if (inOrbWalkthroughStep) {
    try {
      updateHomeStep('orb');
    } catch (e) {
      __DEV__ && console.log('[HOME] Error updating orb walkthrough step:', e);
    }
    // Note: we still let the ritual menu open below
  } else {
    // Normal mode: still mark the orb as seen
    try {
      updateHomeStep('orb');
    } catch (e) {
      __DEV__ && console.log('[HOME] Error updating orb walkthrough step (normal):', e);
    }
  }

  // Haptic feedback
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  } catch (e) {
    __DEV__ && console.log('[HOME] Haptics error on orb tap:', e);
  }

  // Open the orb menu (ritual modal)
  setShowPicker(true);
};

// Track last orb tap + pending timer for Quick Calm double-tap detection
const lastOrbTapRef = useRef(0);
const orbTapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const ORB_DOUBLE_TAP_DELAY = 260;

// Double-tap handler: second tap within ORB_DOUBLE_TAP_DELAY triggers Quick Calm.
// If no second tap arrives, we open the ritual menu via handleOrbTap.
const handleOrbPress = React.useCallback(async () => {
  const now = Date.now();
  const last = lastOrbTapRef.current;

  // If we already have a timestamp and we're within the window → treat as double-tap
  if (last && now - last < ORB_DOUBLE_TAP_DELAY) {
    // Clear any pending single-tap timer
    if (orbTapTimeoutRef.current) {
      clearTimeout(orbTapTimeoutRef.current);
      orbTapTimeoutRef.current = null;
    }
    lastOrbTapRef.current = 0;

    // Quick Calm instead of ritual modal
    await triggerQuickCalm();
    return;
  }

  // Otherwise, this is the first tap – store timestamp and schedule the ritual modal.
  lastOrbTapRef.current = now;

  // Clear any existing timer just in case
  if (orbTapTimeoutRef.current) {
    clearTimeout(orbTapTimeoutRef.current);
    orbTapTimeoutRef.current = null;
  }

  orbTapTimeoutRef.current = setTimeout(() => {
    orbTapTimeoutRef.current = null;
    // Only open the ritual modal if we haven't seen a second tap in time
    handleOrbTap();
  }, ORB_DOUBLE_TAP_DELAY);
}, [handleOrbTap, triggerQuickCalm]);

const handleOrbLongPress = async () => {
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  setShowLunarModal(true);
};
const closeHomeHelp = React.useCallback(() => {
  setShowHomeHelp(false);
}, []);

const neverShowHomeHelp = React.useCallback(async () => {
    try { await Haptics.selectionAsync(); } catch {}
    await markHomeHelperSeen();
    setShowHomeHelp(false);
  }, [markHomeHelperSeen]);

  const loadResumeInfo = useCallback(async () => {
    try {
      // Prefer last *content* snapshot (excludes ambient)
      const rawContent = await AsyncStorage.getItem('player:lastContent'); // { trackId, positionMs, durationMs, chamber? }
      const content = rawContent ? JSON.parse(rawContent) : null;

      let base = content;

      // Fallback to generic last snapshot (filter ambient)
      if (!base) {
        const rawLast = await AsyncStorage.getItem('player:last'); // may include ambient
        const fallback = rawLast ? JSON.parse(rawLast) : null;
        if (fallback && !isAmbient(fallback.trackId)) base = fallback;
      }

      const last = await getLastSession();

      // derive id/chamber
      const id = base?.trackId || (last ? last.id : undefined);
      const chamber = base?.chamber; // session doesn't carry a chamber label

      // If nothing valid or ambient, reset to "My Journey"
      if (!id || isAmbient(id)) {
        setResumeLabel('My Journey');
        setResumeSub('');
        setResumePct(0);
        return;
      }

      // progress snapshot (position/duration)
      const snapRaw = await AsyncStorage.getItem(`player:progress:${id}`);
      const snap = snapRaw ? JSON.parse(snapRaw) : null;

      const position = snap?.positionMs ?? base?.positionMs ?? 0;
      const duration = snap?.durationMs ?? base?.durationMs ?? 0;
      const pct = duration > 0 ? Math.max(0, Math.min(1, position / duration)) : 0;
      const remaining = duration > 0 ? Math.max(0, duration - position) : 0;

      const hasPlayable = duration > 0;
      const hasMappedChamber = !!(chamber && CHAMBER_DEFAULT_TRACK[normalizeChamberName(chamber)]);

      if (hasPlayable || hasMappedChamber) {
        setResumeLabel(chamber ? `Resume • ${chamber}` : 'Resume');
        setResumeSub(hasPlayable ? `${formatMinSec(position)} / ${formatMinSec(duration)}  •  ${formatMinSec(remaining)} left` : '');
        setResumePct(pct);
      } 
      
      if (!hasPlayable && !hasMappedChamber && last) {
        setResumeLabel(last.type === 'journey' ? 'Resume - Chamber' : 'Resume - Soundscape');
        setResumeSub('');
        setResumePct(0);
        return;
      }

      else {
        setResumeLabel('My Journey');
        setResumeSub('');
        setResumePct(0);
      }
    } catch {
      setResumeLabel('My Journey');
      setResumeSub('');
      setResumePct(0);
    }
  }, []);

  const startJourney = async (id: string, chamber?: string) => {
    await saveLastJourney({ id, chamber });              // keep existing fallback for now
    await setLastSession({ type: 'journey', id });       // <-- add this
    await fadeOutHum();
    navigation.navigate('JourneyPlayer', { id, chamber });
    setShowPicker(false);
  };

  // Helper to get the best resume target (lastJourney or player:last)
  const getResumeTarget = useCallback(async (): Promise<{ id: string; chamber?: string } | null> => {
    try {
      // 1) Prefer last *content* (never ambient)
      const rawContent = await AsyncStorage.getItem('player:lastContent');
      const lastContent = rawContent ? JSON.parse(rawContent) : null;
      if (lastContent?.trackId && !isAmbient(lastContent.trackId)) {
        return { id: lastContent.trackId, chamber: lastContent.chamber };
      }

      // 2) Fallbacks
      const rawLast = await AsyncStorage.getItem('player:last'); // may be ambient; filter
      const playerLast = rawLast ? JSON.parse(rawLast) : null;
      const lastJourney = await getLastJourney();

      let id: string | undefined = playerLast?.trackId || lastJourney?.id;
      let chamber: string | undefined = lastJourney?.chamber || playerLast?.chamber;

      // Filter ambient
      if (isAmbient(id)) id = undefined;

      // Map from chamber label if needed
      if (!id && chamber) {
        const key = normalizeChamberName(chamber);
        const mapped = CHAMBER_DEFAULT_TRACK[key];
        if (mapped) id = mapped;
      }

      return id ? { id, chamber } : null;
    } catch {
      return null;
    }
  }, []);

  const resumeFromOrbMenu = async () => {
  try {
    const last = await getLastSession();
    if (last) {
      await fadeOutHum();
      if (last.type === 'journey') {
        navigation.navigate('JourneyPlayer', { id: last.id });
      } else {
        navigation.navigate('JourneyPlayer', { trackId: last.id });
      }
    } else {
  // no last session → begin at Outer Sanctum by default
  await fadeOutHum();
  navigation.navigate('JourneyPlayer', { id: 'outer_sanctum', chamber: 'Chamber 1' });
}
  } finally {
    setShowPicker(false);
  }
};

// --- Ritual quick-start handlers ---
const openPointZero = useCallback(async () => {
  try { await Haptics.selectionAsync(); } catch {}
  await fadeOutHum();
  navigation.navigate('PointZero');
  setShowPicker(false);
}, [fadeOutHum, navigation]);

const openCleanSlate = useCallback(async () => {
  try { await Haptics.selectionAsync(); } catch {}
  await fadeOutHum();
  navigation.navigate('CleanSlate');
  setShowPicker(false);
}, [fadeOutHum, navigation]);

const openInnerFlame = useCallback(async () => {
  try { await Haptics.selectionAsync(); } catch {}
  await fadeOutHum();
  navigation.navigate('InnerFlame');
  setShowPicker(false);
}, [fadeOutHum, navigation]);

  // --- Journey Threading: continue suggested next step from Ritual Modal ---
  const handleThreadContinue = React.useCallback(async () => {
    if (!threadSuggestion) return;
    const s: any = threadSuggestion;
    const targetType: string | undefined = s.targetType;
    const targetId: string | undefined = s.targetId;

    if (!targetType || !targetId) return;

    try { await Haptics.selectionAsync(); } catch {}
    try { await fadeOutHum(); } catch {}

    if (targetType === 'ritual') {
      if (targetId === 'pointZero') {
        navigation.navigate('PointZero');
      } else if (targetId === 'cleanSlate') {
        navigation.navigate('CleanSlate');
      } else if (targetId === 'innerFlame') {
        navigation.navigate('InnerFlame');
      }
    } else if (targetType === 'chamber') {
      navigation.navigate('JourneyPlayer', { id: targetId });
    } else if (targetType === 'soundscape') {
      navigation.navigate('JourneyPlayer', { trackId: targetId });
    } else if (targetType === 'lesson') {
      // For now, route to LearnHub; later we can deep-link into the exact lesson
      navigation.navigate('LearnHub', { focusLessonId: targetId });
    }

    setShowPicker(false);
  }, [threadSuggestion, fadeOutHum, navigation]);

  // Journey Threading – surface last step inside Ritual Modal
  const { suggestion: threadSuggestion } = useThreadSuggestion();

  const threadLine = React.useMemo(() => {
    if (!threadSuggestion) return '';
    const s: any = threadSuggestion;
    const t = s.targetType as string | undefined;
    const typeLabel =
      t === 'ritual' ? 'Ritual' :
      t === 'chamber' ? 'Chamber' :
      t === 'soundscape' ? 'Soundscape' :
      t === 'lesson' ? 'Lesson' :
      'Path';

    const name =
      s.label ||
      s.displayName ||
      s.lastLabel ||
      s.targetName ||
      s.targetId ||
      'Your last step';

    const mood = s.mood ? ` · ${toTitle(String(s.mood))}` : '';

    return `${typeLabel}: ${name}${mood}`;
  }, [threadSuggestion]);

  // Ritual modal copy tuned to current intentions
  const ritualSubtitle = React.useMemo(() => {
    const base = 'Choose a 60-second reset or resume where you left off.';
    if (!intentions || intentions.length === 0) return base;

    const pathLabel =
      intentions.length === 1
        ? intentions[0].toLowerCase()
        : intentions.map((i) => i.toLowerCase()).join(' · ');

    return `Choose a 60-second reset tuned to your ${pathLabel} path, or resume where you left off.`;
  }, [intentions]);

  // If the current thread suggestion is a ritual, capture which one for highlighting
  const ritualTargetId = React.useMemo(() => {
    if (!threadSuggestion) return null;
    const s: any = threadSuggestion;
    return s.targetType === 'ritual' ? s.targetId : null;
  }, [threadSuggestion]);

  const isPointZeroRecommended = ritualTargetId === 'pointZero';
  const isCleanSlateRecommended = ritualTargetId === 'cleanSlate';
  const isInnerFlameRecommended = ritualTargetId === 'innerFlame';

  return (
  <GestureDetector gesture={rootGesture}>
    <View style={styles.container}>
      {/* Background — rendered in a computed fit box (contain/cover) */}
      <Image
        source={BG_ASSET}
        fadeDuration={0}
        resizeMode={BG_FIT}  // 'cover'
        style={[
          StyleSheet.absoluteFillObject,
          {
            left: BG_BOX_LEFT,
            top: BG_BOX_TOP,
            width: BG_BOX_W,
            height: BG_BOX_H,
          },
        ]}
      />
      {/* HomeAuraContinuity overlay, below orb & sigils */}
      <HomeAuraContinuity />
      {/* Micro fog pulse — subtle reactivation drift */}
      <FogPulse />
      {/* Intention aura overlay — static gradient tied to current intentions (RGBA-based) */}
      <LinearGradient
        colors={auraColors}
        locations={auraLocations as any}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
      <StatusBar style="light" backgroundColor="transparent" translucent />

      {/* Top-left Home Help ("?") */}
      <Pressable
        onPress={() => setShowHomeHelp(true)}
        accessibilityRole="button"
        accessibilityLabel="Open Home guide"
        accessibilityHint="Shows a short walkthrough of this screen"
        style={{
          position: 'absolute',
          left: 12,
          top: insets.top + 8,
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(0,0,0,0.30)',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.12)',
          zIndex: 120,
          elevation: 120,
          opacity: 0.9,
        }}
        hitSlop={12}
        onPressIn={async () => { try { await Haptics.selectionAsync(); } catch {} }}
      >
        <Text style={{ color: '#EDEAF6', fontSize: 18, lineHeight: 18 }}>?</Text>
      </Pressable>
      {/* Top-right Settings gear */}
      <Pressable
        onPress={openSettings}
        accessibilityRole="button"
        accessibilityLabel="Open settings"
        accessibilityHint={profileName ? 'Change how Inner refers to you' : 'Edit how Inner addresses you'}
        style={{
          position: 'absolute',
          right: 12,
          top: insets.top + 8,
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(0,0,0,0.30)',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.12)',
          zIndex: 120,
          elevation: 120,
          opacity: 0.9,
        }}
        hitSlop={12}
        onPressIn={async () => { try { await Haptics.selectionAsync(); } catch {} }}
      >
        <Text style={{ color: '#EDEAF6', fontSize: 18, lineHeight: 18 }}>⚙︎</Text>
      </Pressable>
      
      {/* Threshold Moment overlay */}
      {thresholdLine && (
        <Animated.View
        pointerEvents="none"
        style={[
            StyleSheet.absoluteFillObject,
            {
                backgroundColor: 'rgba(6,6,16,0.72)',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: thresholdOpacity,
                zIndex: 999,
                elevation: 999,
            },
        ]}
        >
            <Text
            style={{
                fontFamily: 'Inter-ExtraLight',
                fontSize: 18,
                letterSpacing: 0.6,
                color: 'rgba(240,236,255,0.95)',
                textAlign: 'center',
                paddingHorizontal: 28,
            }}
            >
                {thresholdLine}
                </Text>
        </Animated.View>
)}

      {/* Quick Calm overlay and drifting text */}
      {quickCalmVisible && (
        <>
          {/* Scene softening overlay for Quick Calm */}
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFillObject,
              {
                opacity: quickCalmOverlayOpacity,
                backgroundColor: 'rgba(10,6,26,0.55)',
              },
            ]}
          />

          {/* Whisper text drifting up near the lower screen */}
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: SCREEN_H * 0.65,
              alignItems: 'center',
            }}
          >
            <Animated.Text
              style={{
                fontFamily: 'Inter-ExtraLight',
                fontSize: 16,
                letterSpacing: 0.6,
                color: 'rgba(240,236,255,0.98)',
                textAlign: 'center',
                opacity: quickCalmTextOpacity,
                transform: [{ translateY: quickCalmTranslateY }],
              }}
            >
              {quickCalmLine}
            </Animated.Text>
          </Animated.View>
        </>
      )}

      {/* Daily streak pill – combined rituals + learning */}
      {dailySnapshot?.streakCount ? (
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            top: insets.top + 10,
            right: 56, // just to the left of the settings gear
            zIndex: 130,
            elevation: 130,
          }}
        >
          <BlurView
            intensity={40}
            tint="dark"
            style={{
              borderRadius: 999,
              overflow: 'hidden',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.10)',
              backgroundColor: 'rgba(6,6,16,0.88)',
            }}
          >
            <LinearGradient
              colors={[
                'rgba(255,190,140,0.45)',
                'rgba(180,120,255,0.30)',
              ]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 6,
                flexDirection: 'row',
                alignItems: 'center',
              }}
            >
              {/* Ember dot */}
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  marginRight: 8,
                  backgroundColor: 'rgba(255,214,170,0.95)',
                  shadowColor: '#FFD6AA',
                  shadowOpacity: 0.9,
                  shadowOffset: { width: 0, height: 0 },
                  shadowRadius: 8,
                }}
              />

              {/* Main streak label */}
              <Text
                style={{
                  fontFamily: 'CalSans-SemiBold',
                  fontSize: 12,
                  color: '#F9F5FF',
                  marginRight: 4,
                }}
                numberOfLines={1}
              >
                {dailySnapshot.streakCount === 1
                  ? '1 day in a row'
                  : `${dailySnapshot.streakCount} days in a row`}
              </Text>

              {/* Soft contextual hint */}
              <Text
                style={{
                  fontFamily: 'Inter-ExtraLight',
                  fontSize: 11,
                  color: 'rgba(244,236,255,0.92)',
                }}
                numberOfLines={1}
              >
                {dailySnapshot.activeToday
                  ? 'Streak is safe for today.'
                  : 'Keep it alive tonight.'}
              </Text>
            </LinearGradient>
          </BlurView>
        </View>
      ) : null}

      {/* Dust overlay – above bg, below orb & UI */}
      <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: dustOpacity }}>
        <LottieView
          source={require('../assets/animations/dust-drift.json')}
          autoPlay
          loop
          pointerEvents="none"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          speed={0.8}
        />
      </Animated.View>

      {/* Vignette overlay – simplified to full-screen gradients to avoid rectangular seams */}
      <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: vignetteOpacity }]} pointerEvents="none">
        {/* Vertical fade (top→bottom) */}
        <LinearGradient
          colors={["rgba(0,0,0,0.00)", "rgba(0,0,0,0.65)"]}
          locations={[0, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {/* Horizontal fade (edges→center) */}
        <LinearGradient
          colors={["rgba(0,0,0,0.50)", "rgba(0,0,0,0.00)", "rgba(0,0,0,0.50)"]}
          locations={[0, 0.5, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* Top Suggestion Card (fixed near top, above orb) */}
      {suggestion && !suggDismissed && (
        <Animated.View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            top: insets.top + 16,
            left: 0,
            right: 0,
            zIndex: 80,
            elevation: 80,
            opacity: suggOpacity,
            transform: [{ translateY: suggTranslate }],
          }}
        >
          <View
            style={{
              alignSelf: 'center',
              width: '78%',
              maxWidth: 380,
              paddingHorizontal: 6,
            }}
          >
            <AnimatedPressable
              accessibilityRole="button"
              accessibilityLabel={`Tonight’s practice: ${suggestion.title}. Double tap to begin.`}
              accessibilityHint="Starts the suggested practice"
              onPress={handleStartSuggestion}
             onPressIn={() => {
                Animated.timing(suggPress, {
                    toValue: 1,
                    duration: 140,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true,
                }).start();
            }}
            onPressOut={() => {
                Animated.timing(suggPress, {
                    toValue: 0,
                    duration: 220,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true,
                }).start();
            }}
            style={{
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: 16,
                overflow: 'hidden',
                transform: [{ scale: suggPressScale }],
            }}
            >
              <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />
              <LinearGradient
                pointerEvents="none"
                colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.02)']}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              {/* Soft inner vignette */}
              <LinearGradient
                pointerEvents="none"
                colors={[
                  'rgba(0,0,0,0.22)',
                  'rgba(0,0,0,0.00)',
                  'rgba(0,0,0,0.22)',
                ]}
                locations={[0, 0.5, 1]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFill}
              />
              <Animated.View
                pointerEvents="none"
                style={{
                  ...StyleSheet.absoluteFillObject,
                  borderWidth: 1,
                  borderColor: suggPressBorder,
                  borderRadius: 16,
                }}
              />
              {/* Press glow (subtle) */}
              <Animated.View
                pointerEvents="none"
                style={{
                  ...StyleSheet.absoluteFillObject,
                  backgroundColor: 'rgba(255,255,255,0.04)',
                  opacity: suggPressGlow,
                  borderRadius: 16,
                }}
              />
              {/* Whisper copy */}
              <Text
                style={{
                  fontFamily: 'Inter-ExtraLight',
                  fontSize: 12,
                  color: 'rgba(191,199,255,0.78)',
                  letterSpacing: 0.2,
                  textAlign: 'center',
                  marginBottom: 4,
                }}
              >
                Tonight, a door is open.
              </Text>

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                <Text
                  numberOfLines={1}
                  style={{
                    fontFamily: 'CalSans-SemiBold',
                    fontSize: 14,
                    color: 'rgba(255,255,255,0.94)',
                    letterSpacing: 0.15,
                    textAlign: 'center',
                    maxWidth: 280,
                  }}
                >
                  {suggestion.title}
                </Text>

                {suggestion.minutes ? (
                  <Text
                    style={{
                      marginLeft: 8,
                      fontFamily: 'Inter-ExtraLight',
                      fontSize: 12,
                      color: 'rgba(207,213,255,0.70)',
                    }}
                  >
                    · {suggestion.minutes} min
                  </Text>
                ) : null}
                {/* Chevron removed */}
              </View>

              {/* Hairline underline to keep it intentional */}
              <View
                style={{
                  marginTop: 8,
                  alignSelf: 'center',
                  width: 190,
                  height: 1,
                  backgroundColor: 'rgba(255,255,255,0.06)',
                }}
              />
            </AnimatedPressable>

            {/* Dismiss (kept subtle, separate tap target) */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss tonight’s practice"
              onPress={handleDismissSuggestion}
              hitSlop={10}
              style={{
                alignSelf: 'center',
                marginTop: 2,
                paddingVertical: 6,
                paddingHorizontal: 10,
              }}
            >
              <Text
                style={{
                  fontFamily: 'Inter-ExtraLight',
                  fontSize: 12,
                  color: 'rgba(207,195,224,0.78)',
                  letterSpacing: 0.2,
                }}
              >
                Later
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      )}


      {/* Portal / Orb */}
      <View style={styles.portalWrap} pointerEvents="box-none">
        {/* Base orb — always visible */}
        <Animated.Image
          pointerEvents="none"
          source={DEFAULT_ORB_SRC}
          resizeMode="contain"
          accessibilityRole="image"
          accessibilityLabel={'Home orb'}
          style={[
            styles.orbImage,
            {
              position: 'absolute',
              left: ORB_LEFT,
              top: ORB_TOP,
              width: ORB_WIDTH,
              height: ORB_WIDTH,
              transform: [{
                scale: Animated.multiply(
                  Animated.multiply(
                    Animated.multiply(
                      Animated.multiply(orbScale, orbParallaxScale),
                      portalPressScale
                    ),
                    quickCalmOrbScale
                  ),
                  innerPulseScale
                ),
              }],
              // Attenuate with parallax only; no swap alpha here
              opacity: orbParallaxOpacity,
            },
          ]}
        />

        {/* Orb spotlight overlay (walkthrough) */}
        {showHomeHelp && (
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: ORB_LEFT - ORB_WIDTH * 0.08,
              top: ORB_TOP - ORB_WIDTH * 0.08,
              width: ORB_WIDTH * 1.16,
              height: ORB_WIDTH * 1.16,
              borderRadius: (ORB_WIDTH * 1.16) / 2,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.65)',
              opacity: orbSpotlight.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 1],
              }),
              transform: [
                {
                  scale: orbSpotlight.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 1.08],
                  }),
                },
              ],
            }}
          />
        )}

        {/* Moon overlay — fades in/out above the base orb */}
        <Animated.Image
          pointerEvents="none"
          source={moonOverlaySrc}
          resizeMode="contain"
          accessible={false}
          style={[
            styles.orbImage,
            {
              position: 'absolute',
              left: ORB_LEFT,
              top: ORB_TOP,
              width: ORB_WIDTH,
              height: ORB_WIDTH,
              transform: [{
                scale: Animated.multiply(
                  Animated.multiply(
                    Animated.multiply(
                      Animated.multiply(orbScale, orbParallaxScale),
                      portalPressScale
                    ),
                    quickCalmOrbScale
                  ),
                  innerPulseScale
                ),
              }],
              // Fade the moon overlay only; base orb stays visible underneath
              opacity: Animated.multiply(orbParallaxOpacity, orbSwapAlpha),
            },
          ]}
        />
        {/* Tap target limited to orb center so list below remains touchable */}
        <AnimatedPressable
          pointerEvents="box-only"
          onPress={handleOrbPress}
          onLongPress={handleOrbLongPress}
          delayLongPress={800}
          hitSlop={0}
          pressRetentionOffset={0}
          onLayout={(e) => {
            const { x, y, width, height } = e.nativeEvent.layout;
            __DEV__ && console.log('[DEBUG ORB] layout:', { x, y, width, height });
          }}
          onPressIn={async () => {
            try { await Haptics.selectionAsync(); } catch {}
            portalPress.stopAnimation();
            portalPress.setValue(0);
            Animated.timing(portalPress, {
              toValue: 1,
              duration: 120,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }).start();
          }}
          onPressOut={() => {
            Animated.timing(portalPress, {
              toValue: 0,
              duration: 160,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }).start();
          }}
          style={[
            {
              position: 'absolute',
              left: ORB_LEFT + ORB_WIDTH / 2,
              top: ORB_TOP + ORB_WIDTH / 2,
              width: ORB_HIT_DIAMETER,
              height: ORB_HIT_DIAMETER,
              borderRadius: ORB_HIT_DIAMETER / 2,
              transform: [
                { translateX: (-ORB_HIT_DIAMETER / 2) + ORB_HIT_OFFSET_X },
                { translateY: (-ORB_HIT_DIAMETER / 2) + ORB_HIT_OFFSET_Y },
                { scale: Animated.multiply(
                    Animated.multiply(
                      Animated.multiply(orbScale, orbParallaxScale),
                      portalPressScale
                    ),
                    quickCalmOrbScale
                  )
                },
              ],
              ...(DEBUG_ORB_HIT ? {
                backgroundColor: 'rgba(255, 0, 0, 0.12)',
                borderWidth: 1,
                borderColor: 'rgba(255, 230, 0, 0.9)',
              } : null),
            },
          ]}
        >
          {DEBUG_ORB_HIT ? (
            <>
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: 0,
                  width: 2,
                  height: '100%',
                  backgroundColor: 'rgba(255,230,0,0.9)',
                  transform: [{ translateX: -1 }],
                }}
              />
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: 0,
                  height: 2,
                  width: '100%',
                  backgroundColor: 'rgba(255,230,0,0.9)',
                  transform: [{ translateY: -1 }],
                }}
              />
            </>
          ) : null}
        </AnimatedPressable>

        

        {/* Left Sigil Halo — Lavender (soft PNG radial) */}
        <Animated.Image
          pointerEvents="none"
          source={HALO_LAVENDER}
          resizeMode="contain"
          style={{
            position: 'absolute',
            left: SIGIL_LEFT_LEFT - GLOW_PAD * 2,
            top: SIGIL_LEFT_TOP - GLOW_PAD * 2,
            width: SIGIL_SIZE + GLOW_PAD * 4,
            height: SIGIL_SIZE + GLOW_PAD * 4,
            opacity: sigilColorOpacityL,
            transform: [{ scale: sigilScaleL }],
            zIndex: 55,
            elevation: 55,
          }}
        />
        {/* Left Sigil Diffusion — soft white */}
        <Animated.Image
          pointerEvents="none"
          source={HALO_DIFFUSE}
          resizeMode="contain"
          style={{
            position: 'absolute',
            left: SIGIL_LEFT_LEFT - GLOW_PAD * 1.4,
            top: SIGIL_LEFT_TOP - GLOW_PAD * 1.4,
            width: SIGIL_SIZE + GLOW_PAD * 2.8,
            height: SIGIL_SIZE + GLOW_PAD * 2.8,
            opacity: sigilDiffuseOpacityL,
            transform: [{ scale: sigilScaleL }],
            zIndex: 55.5,
            elevation: 55,
          }}
        />
        {/* Left Sigil — Journal / Reflections */}
        <Animated.View
          style={{
            position: 'absolute',
            left: SIGIL_LEFT_LEFT,
            top: SIGIL_LEFT_TOP,
            width: SIGIL_SIZE,
            height: SIGIL_SIZE,
            transform: [{ scale: Animated.multiply(sigilScaleL, sigilPressScaleL) }],
            opacity: sigilOpacityL,
            zIndex: 56,
            elevation: 56,
          }}
          pointerEvents="box-none"
        >
          <Pressable
            onPress={async () => {
              try { await Haptics.selectionAsync(); } catch {}
              try {
                navigation.navigate('Journal');
              } catch (e) {
                __DEV__ && console.log('[Nav] Journal route missing, implement screen route:', e);
              }
            }}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Open Journal"
            style={{ flex: 1 }}
            onPressIn={async () => {
              try { await Haptics.selectionAsync(); } catch {}
              sigilPressL.stopAnimation();
              sigilPressL.setValue(0);
              Animated.timing(sigilPressL, {
                toValue: 1,
                duration: 120,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
              }).start();
            }}
            onPressOut={() => {
              Animated.timing(sigilPressL, {
                toValue: 0,
                duration: 160,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
              }).start();
            }}
          >
            <Image source={SIGIL_JOURNAL} resizeMode="contain" style={{ width: '100%', height: '100%' }} />
          </Pressable>
        </Animated.View>

        {/* Right Sigil Halo — Gold (soft PNG radial) */}
        <Animated.Image
          pointerEvents="none"
          source={HALO_GOLD}
          resizeMode="contain"
          style={{
            position: 'absolute',
            left: SIGIL_RIGHT_LEFT - GLOW_PAD * 2,
            top: SIGIL_RIGHT_TOP - GLOW_PAD * 2,
            width: SIGIL_SIZE + GLOW_PAD * 4,
            height: SIGIL_SIZE + GLOW_PAD * 4,
            opacity: sigilColorOpacityR,
            transform: [{ scale: sigilScaleR }],
            zIndex: 55,
            elevation: 55,
          }}
        />
        {/* Right Sigil Diffusion — soft white */}
        <Animated.Image
          pointerEvents="none"
          source={HALO_DIFFUSE}
          resizeMode="contain"
          style={{
            position: 'absolute',
            left: SIGIL_RIGHT_LEFT - GLOW_PAD * 1.4,
            top: SIGIL_RIGHT_TOP - GLOW_PAD * 1.4,
            width: SIGIL_SIZE + GLOW_PAD * 2.8,
            height: SIGIL_SIZE + GLOW_PAD * 2.8,
            opacity: sigilDiffuseOpacityR,
            transform: [{ scale: sigilScaleR }],
            zIndex: 55.5,
            elevation: 55,
          }}
        />
        {/* Right Sigil — Community / Resonance */}
        <Animated.View
          style={{
            position: 'absolute',
            left: SIGIL_RIGHT_LEFT,
            top: SIGIL_RIGHT_TOP,
            width: SIGIL_SIZE,
            height: SIGIL_SIZE,
            transform: [{ scale: Animated.multiply(sigilScaleR, sigilPressScaleR) }],
            opacity: sigilOpacityR,
            zIndex: 56,
            elevation: 56,
          }}
          pointerEvents="box-none"
        >
          <Pressable
            onPress={async () => {
              try { await Haptics.selectionAsync(); } catch {}
              try {
                navigation.navigate('Community');
              } catch (e) {
                __DEV__ && console.log('[Nav] Community route missing, implement screen route:', e);
              }
            }}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Open Community"
            style={{ flex: 1 }}
            onPressIn={async () => {
              try { await Haptics.selectionAsync(); } catch {}
              sigilPressR.stopAnimation();
              sigilPressR.setValue(0);
              Animated.timing(sigilPressR, {
                toValue: 1,
                duration: 120,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
              }).start();
            }}
            onPressOut={() => {
              Animated.timing(sigilPressR, {
                toValue: 0,
                duration: 160,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
              }).start();
            }}
          >
            <Image source={SIGIL_COMMUNITY} resizeMode="contain" style={{ width: '100%', height: '100%' }} />
          </Pressable>
        </Animated.View>
      </View>

      <View
        pointerEvents="box-none"
        style={{ alignSelf: 'stretch', alignItems: 'center', paddingTop: 360, paddingBottom: 40 }}
      >
        {/* Hero section (keeps welcome + CTA visually centered) */}
        <View
          pointerEvents="box-none"
          style={[styles.heroSection, { minHeight: HERO_MIN }]}> 
          {/* Message */}
          <Animated.Text
            style={[
              Body.regular,
              { fontFamily: 'Inter-ExtraLight', letterSpacing: 0.3, color: '#EDEAF6', opacity: msgOpacity, transform: [{ translateY: msgTranslate }], marginTop: 8, marginBottom: 12, textAlign: 'center' },
            ]}
          >
            {profileName
              ? (hasLaunched ? `Welcome back, ${profileName}` : `Welcome, ${profileName}`)
              : (hasLaunched ? 'Welcome back to your sanctum' : 'Welcome to your sanctum')}
          </Animated.Text>


          {/* Primary CTA(s) */}
          <View style={styles.actions} pointerEvents="box-none">
            <TouchableOpacity
              onPress={async () => {
                if (navigating) return;
                setNavigating(true);
                try {
                    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
                    const last = await getLastSession();
                    if (last) {
                        await fadeOutHum();
                        if (last.type === 'journey') {
                            navigation.navigate('JourneyPlayer', { id: last.id });
                    } else {
                            navigation.navigate('JourneyPlayer', { trackId: last.id });
                        }
                    } else {
                    // no last session → let user choose their path
                    await fadeOutHum();
                    setShowPicker(true);
                    }
                } finally {
                setTimeout(() => setNavigating(false), 400);
                }
              }}
              hitSlop={0}
              pressRetentionOffset={0}
              activeOpacity={0.95}
              disabled={navigating}
              style={[styles.primaryButton, { overflow: 'hidden', opacity: navigating ? 0.7 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel={resumeLabel}
            >
              {/* Static top gloss */}
              <LinearGradient
                colors={['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.04)', 'rgba(255,255,255,0.00)']}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />

              {/* Moving shimmer band */}
              <Animated.View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  top: -12,
                  bottom: -12,
                  width: 80,
                  opacity: 0.45,
                  transform: [
                    {
                      translateX: shimmerX.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-220, 260],
                      }),
                    },
                    { rotate: '-18deg' },
                  ],
                }}
              >
                <LinearGradient
                  colors={['rgba(255,255,255,0.00)', 'rgba(199,170,255,.9)', 'rgba(255,255,255,0.00)']}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={{ flex: 1 }}
                />
              </Animated.View>

              <Text style={[Typography.title, { color: '#1F233A', lineHeight: 20 }]}> {resumeLabel} </Text>
              {false && !!resumeSub && <Text style={[Typography.caption, { color: '#2B2F46', textAlign: 'center', marginTop: 2, opacity: 0.8 }]}>{resumeSub}</Text>}
              {false && (
                <View style={styles.progressTrack}>
                  <Animated.View style={[styles.progressFill, { width: `${Math.round(resumePct * 100)}%` }]} />
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>
        {/* Cards row (no scrolling) */}
      </View>

      {/* --- NAV ARROWS OVERLAY (absolute, high zIndex/elevation) --- */}
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 100,
          elevation: 100,
        }}
      >
        {/* Left: Soundscapes */}
<Animated.View
  style={{
    // only fade the whole container, no scaling here
    opacity: leftHintOpacity,
  }}
>
  <Pressable
    onPress={goToSoundscapes}
    accessibilityRole="button"
    accessibilityLabel="Go to Soundscapes"
    style={[styles.navArrowLeft, { zIndex: 61, elevation: 61 }]}
    hitSlop={16}
    onLongPress={async () => {
      try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
      runHint(leftHint);
    }}
    delayLongPress={450}
  >
    <Animated.Text
      style={[
        styles.navArrowText,
        {
          // pulse only the glyph
          opacity: leftHintOpacity,
          transform: [
            {
              scale: leftHintScale,
            },
          ],
        },
      ]}
    >
      {'\u2039'}
    </Animated.Text>
  </Pressable>
</Animated.View>

        {/* Right: Chambers */}
<Animated.View
  style={{
    // only opacity here as well
    opacity: rightHintOpacity,
  }}
>
  <Pressable
    onPress={goToChambers}
    accessibilityRole="button"
    accessibilityLabel="Go to Chambers"
    style={[styles.navArrowRight, { zIndex: 61, elevation: 61 }]}
    hitSlop={16}
    onLongPress={async () => {
      try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
      runHint(rightHint);
    }}
    delayLongPress={450}
  >
    <Animated.Text
      style={[
        styles.navArrowText,
        {
          opacity: rightHintOpacity,
          transform: [
            {
              scale: rightHintScale,
            },
          ],
        },
      ]}
    >
      {'\u203A'}
    </Animated.Text>
  </Pressable>
</Animated.View>

        {/* Bottom: Learning Hub */}
        <Pressable
  onPress={async () => {
    __DEV__ && console.log(
      '[HOME] Bottom chevron pressed. showHomeHelp=',
      showHomeHelp,
      'learnHub step=',
      homeSteps.learnHub
    );

    // During the Home walkthrough, treat a tap on this chevron as explicitly fulfilling
    // the Learning Hub step before we navigate anywhere.
    if (showHomeHelp && !homeSteps.learnHub) {
      __DEV__ && console.log('[HOME] Completing LearnHub walkthrough step from bottom chevron tap');
      updateHomeStep('learnHub');
      try {
        await Haptics.selectionAsync();
      } catch {}
      return;
    }

    await goToLearnHub();
  }}
  accessibilityRole="button"
  accessibilityLabel="Open Learning Hub"
  accessibilityHint="Opens Inner’s Learning Hub with guides and lessons"
  accessible={true}
  importantForAccessibility="yes"
  style={[styles.navArrowBottom, { bottom: insets.bottom + 24 }]}
  hitSlop={{ top: 32, bottom: 32, left: 56, right: 56 }} // keep the generous hit area
>
  <Text style={styles.navArrowText}>{'\u2304'}</Text>
</Pressable>
        <Text
          pointerEvents="none"
          accessibilityRole="text"
          style={[
            Typography.caption,
            {
              fontFamily: 'CalSans-SemiBold',
              textAlign: 'center',
              fontSize: 16,
              position: 'absolute',
              left: '50%',
              bottom: insets.bottom + 4,
              width: 120,
              transform: [{ translateX: -60 }],
              color: '#EDEAF6',
              backgroundColor: 'transparent',
              zIndex: 61,
              elevation: 61,
            },
          ]}
        >
          Learning Hub
        </Text>
      </View>
      <LunarWhisperModal
        visible={showLunarModal}
        phase={orbPhase}
        onClose={() => setShowLunarModal(false)}
        onReflect={() => {
          setShowLunarModal(false);
          try { Haptics.selectionAsync(); } catch {}
          try { fadeOutHum(); } catch {}
          navigation.navigate('Journal');
        }}
      />
      <HomeHelperModalInline
        visible={showHomeHelp}
        onClose={closeHomeHelp}
        onDismissForever={neverShowHomeHelp}
        steps={homeSteps}
        activeStep={activeStep}
        tutorialMode={tutorialMode}
        onStartTutorial={() => setTutorialMode(true)}
        onOrbPress={handleOrbStepPress}
        onNavPress={handleNavStepPress}
        onLearnPress={handleLearnStepPress}
    />
                  {/* Orb Menu – Orb Rituals + Resume */}
           <Modal
        visible={showPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPicker(false)}
      >
        <View style={StyleSheet.absoluteFillObject}>
          {/* Backdrop – tap to close */}
          <Pressable
            style={[
              StyleSheet.absoluteFillObject,
              { backgroundColor: 'rgba(3,3,12,0.78)' },
            ]}
            onPress={() => setShowPicker(false)}
            accessibilityRole="button"
            accessibilityLabel="Close ritual menu"
            accessibilityHint="Dismisses the ritual options and returns you to the Home screen"
          />

          {/* Centered card */}
          <View
            style={{
              flex: 1,
              justifyContent: 'center',
              alignItems: 'center',
              paddingHorizontal: 24,
            }}
          >
            <View
              style={{
                width: '100%',
                maxWidth: 420,
                borderRadius: 20,
                paddingVertical: 18,
                paddingHorizontal: 18,
                backgroundColor: 'rgba(8,8,20,0.96)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.12)',
              }}
            >
             {threadSuggestion && (
                <View
                  style={{
                    marginBottom: 14,
                    paddingBottom: 10,
                    borderBottomWidth: 1,
                    borderBottomColor: 'rgba(255,255,255,0.08)',
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={{
                      fontFamily: 'CalSans-SemiBold',
                      fontSize: 15,
                      color: '#F5F1FF',
                      marginBottom: 4,
                      textAlign: 'center',
                    }}
                  >
                    Continue your thread
                  </Text>

                  {!!threadLine && (
                    <Text
                      style={{
                        fontFamily: 'CalSans-Semibold',
                        fontSize: 16,
                        color: '#D4CCE9',
                        marginBottom: 8,
                        textAlign: 'center',
                      }}
                    >
                      {threadLine}
                    </Text>
                  )}

                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={handleThreadContinue}
                    style={{
                      alignSelf: 'center',
                      borderRadius: 999,
                      paddingVertical: 7,
                      paddingHorizontal: 14,
                      backgroundColor: 'rgba(180,140,255,0.20)',
                      borderWidth: 1,
                      borderColor: 'rgba(220,200,255,0.60)',
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: 'Inter-ExtraLight',
                        fontSize: 13,
                        letterSpacing: 0.4,
                        color: '#F9F5FF',
                      }}
                    >
                      Continue from here
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
              {/* Header */}
              <Text
                style={[
                  Typography.title,
                  {
                    fontFamily: 'CalSans-SemiBold',
                    color: '#F4F1FF',
                    fontSize: 20,
                    textAlign: 'center',
                    letterSpacing: 0.3,
                    marginBottom: 4,
                  },
                ]}
              >
                Quick Rituals
              </Text>
              <Text
                style={[
                  Body.subtle,
                  {
                    fontFamily: 'Inter-ExtraLight',
                    color: '#CAC3ED',
                    fontSize: 13,
                    textAlign: 'center',
                    marginBottom: 16,
                  },
                ]}
              >
                {ritualSubtitle}
              </Text>

              {/* Ritual options */}
              <View style={{ gap: 8, marginBottom: 10 }}>
                {/* Point 0 */}
                <Pressable
                  onPress={openPointZero}
                  accessibilityRole="button"
                  accessibilityLabel="Point 0 ritual"
                  accessibilityHint="Opens a one minute grounding ritual to drop beneath the noise"
                  style={[
                    {
                      borderRadius: 14,
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      backgroundColor: 'rgba(255,255,255,0.02)',
                      borderWidth: 1,
                      borderColor: 'rgba(181,169,255,0.35)',
                    },
                    isPointZeroRecommended && {
                      borderColor: 'rgba(230,215,255,0.85)',
                      backgroundColor: 'rgba(40,24,68,0.55)',
                      shadowColor: '#E6D7FF',
                      shadowOpacity: 0.45,
                      shadowRadius: 16,
                      shadowOffset: { width: 0, height: 0 },
                      elevation: 6,
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontFamily: 'CalSans-SemiBold',
                      fontSize: 14,
                      letterSpacing: 0.7,
                      textTransform: 'uppercase',
                      color: '#B5A9FF',
                      marginBottom: 2,
                    }}
                  >
                    Point 0 · Ground
                  </Text>
                  <Text
                    style={{
                      fontFamily: 'Inter-ExtraLight',
                      fontSize: 15,
                      color: '#F0EEF8',
                      marginBottom: 2,
                    }}
                  >
                    Drop beneath the noise.
                  </Text>
                  <Text
                    style={{
                      fontFamily: 'Inter-ExtraLight',
                      fontSize: 12,
                      color: '#C4BDD8',
                    }}
                  >
                    Best when your nervous system feels loud or scattered.
                  </Text>
                </Pressable>

                {/* Clean Slate */}
                <Pressable
                  onPress={openCleanSlate}
                  accessibilityRole="button"
                  accessibilityLabel="Clean Slate ritual"
                  accessibilityHint="Opens a one minute clarity ritual to clear mental fog"
                  style={[
                    {
                      borderRadius: 14,
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      backgroundColor: 'rgba(255,255,255,0.02)',
                      borderWidth: 1,
                      borderColor: 'rgba(148,231,255,0.32)',
                    },
                    isCleanSlateRecommended && {
                      borderColor: 'rgba(208,244,255,0.90)',
                      backgroundColor: 'rgba(10,36,54,0.60)',
                      shadowColor: '#D0F4FF',
                      shadowOpacity: 0.45,
                      shadowRadius: 16,
                      shadowOffset: { width: 0, height: 0 },
                      elevation: 6,
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontFamily: 'CalSans-SemiBold',
                      fontSize: 14,
                      letterSpacing: 0.7,
                      textTransform: 'uppercase',
                      color: '#93E1FF',
                      marginBottom: 2,
                    }}
                  >
                    Clean Slate · Clarity
                  </Text>
                  <Text
                    style={{
                      fontFamily: 'Inter-ExtraLight',
                      fontSize: 15,
                      color: '#F0EEF8',
                      marginBottom: 2,
                    }}
                  >
                    Clear the inner screen.
                  </Text>
                  <Text
                    style={{
                      fontFamily: 'Inter-ExtraLight',
                      fontSize: 12,
                      color: '#C4BDD8',
                    }}
                  >
                    Best between tasks, or before a deep session.
                  </Text>
                </Pressable>

                {/* Inner Flame */}
                <Pressable
                  onPress={openInnerFlame}
                  accessibilityRole="button"
                  accessibilityLabel="Inner Flame ritual"
                  accessibilityHint="Opens a one minute ritual to reconnect with your inner fire"
                  style={[
                    {
                      borderRadius: 14,
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      backgroundColor: 'rgba(255,255,255,0.02)',
                      borderWidth: 1,
                      borderColor: 'rgba(255,190,140,0.38)',
                    },
                    isInnerFlameRecommended && {
                      borderColor: 'rgba(255,220,188,0.95)',
                      backgroundColor: 'rgba(54,30,12,0.60)',
                      shadowColor: '#FFDCC0',
                      shadowOpacity: 0.45,
                      shadowRadius: 16,
                      shadowOffset: { width: 0, height: 0 },
                      elevation: 6,
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontFamily: 'CalSans-SemiBold',
                      fontSize: 14,
                      letterSpacing: 0.7,
                      textTransform: 'uppercase',
                      color: '#FFC895',
                      marginBottom: 2,
                    }}
                  >
                    Inner Flame · Renew
                  </Text>
                  <Text
                    style={{
                      fontFamily: 'Inter-ExtraLight',
                      fontSize: 15,
                      color: '#F0EEF8',
                      marginBottom: 2,
                    }}
                  >
                    Remember your spark.
                  </Text>
                  <Text
                    style={{
                      fontFamily: 'Inter-ExtraLight',
                      fontSize: 12,
                      color: '#C4BDD8',
                    }}
                  >
                    Best when you feel flat, uninspired, or drained.
                  </Text>
                </Pressable>
              </View>

              {/* Resume section */}
              <View
                style={{
                  borderTopWidth: 1,
                  borderTopColor: 'rgba(255,255,255,0.08)',
                  paddingTop: 10,
                  marginTop: 4,
                  gap: 8,
                }}
              >
                <Pressable
                  onPress={resumeFromOrbMenu}
                  accessibilityRole="button"
                  accessibilityLabel="Resume last journey"
                  accessibilityHint="Continue the last Chamber or Soundscape you were in"
                  style={{
                    borderRadius: 16,
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    backgroundColor: '#CFC3E0',
                    borderWidth: 1,
                    borderColor: 'rgba(24,22,42,0.85)',
                  }}
                >
                  <Text
                    style={{
                      fontFamily: 'CalSans-SemiBold',
                      fontSize: 15,
                      color: '#171727',
                      letterSpacing: 0.2,
                      textAlign: 'center',
                      width: '100%',
                      marginBottom: resumeSub ? 2 : 0,
                    }}
                  >
                    {resumeLabel || 'Resume journey'}
                  </Text>
                  {Boolean(resumeSub) && (
                    <Text
                      style={{
                        fontFamily: 'Inter-ExtraLight',
                        fontSize: 12,
                        color: '#25243A',
                      }}
                    >
                      {resumeSub}
                    </Text>
                  )}
                </Pressable>

                <Pressable
                  onPress={() => setShowPicker(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Close ritual menu"
                  accessibilityHint="Return to the Home screen without starting a ritual"
                  style={{ alignSelf: 'center', paddingVertical: 4, paddingHorizontal: 8 }}
                >
                  <Text
                    style={{
                      fontFamily: 'Inter-ExtraLight',
                      fontSize: 13,
                      color: '#EDEAF6',
                    }}
                  >
                    Not right now
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>
      {/* Settings + Privacy + Clear Cache */}
      <SettingsModal
        visible={showSettings}
        onClose={() => setShowSettings(false)}
        onSettingsDismiss={handleSettingsModalDismissed}
        profileName={profileName}
        onProfileNameSaved={setProfileName}
        onChangeIntentions={handleChangeIntentions}
        onOpenPaywall={handleSettingsPaywall}
        innerPulseUnlocked={innerPulseUnlocked}
        innerPulseEnabled={innerPulseEnabled}
        onInnerPulseToggle={setInnerPulseEnabled}
        weeklyEmbers={weeklyEmbers}
        totalEmbers={totalEmbers}
      />
    </View>
</GestureDetector>
    );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d1a',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingVertical: 0,
  },
  // NOTE: portalWrap sits *under* heroSection. If CTA becomes untouchable, raise heroSection zIndex/elevation.
  portalWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 55,
    elevation: 55,
  },
  orbImage: {},
  orbHit: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    borderRadius: 9999,
  },
  portalCore: {
    width: 147,
    height: 147,
    borderRadius: 90,
    backgroundColor: 'rgba(203, 179, 240, 0.35)', // inner light
  },
  portalGlow: {
    position: 'absolute',
    left: -30, right: -30, top: -30, bottom: -30,
    borderRadius: 220,
    backgroundColor: 'rgba(203, 179, 240, 0.18)', // lavender aura
  },
  actions: {
    alignItems: 'center',
    marginBottom: 12,
    zIndex: 75,
    elevation: 75, // Android elevation
  },
  primaryButton: {
    backgroundColor: '#CFC3E0',
    paddingVertical: 10,
    paddingHorizontal: 32,
    borderRadius: 20,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
  },
  // primaryText: { color: '#1F233A', fontSize: 18, fontWeight: '600', lineHeight: 20 },
  // secondaryText: { color: '#F0EEF8', fontSize: 14, opacity: 0.85 },
  // heroSection is intentionally stacked above orb for reliable tap handling on CTA
  heroSection: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 12,
    zIndex: 70,
    elevation: 70, // Android elevation
  },


  intentionAffirmation: {
    marginTop: 4,
    color: '#E8E5F3',
    fontSize: 14,
    opacity: 0.9,
    textAlign: 'center',
},
progressTrack: {
  marginTop: 6,
  width: '86%',
  height: 3,
  borderRadius: 3,
  backgroundColor: 'rgba(31,35,58,0.25)',
  alignSelf: 'center',
  overflow: 'hidden',
},
progressFill: {
  height: '100%',
  backgroundColor: '#6B5AE0', // Deep indigo — subtle, on-brand
},

  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCard: {
    width: '84%',
    backgroundColor: 'rgba(18,18,32,0.96)',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)'
  },
  modalBtn: {
    backgroundColor: 'rgba(207,195,224,0.18)',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginTop: 10,
  },
  tileBlur: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)'
  },
  tileBg: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  tileHighlight: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 28,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  navArrowHint: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: 'rgba(207,195,224,0.85)', // lavender ring
    backgroundColor: 'transparent',
    zIndex: 24, // just beneath the arrows (which render after)
  },
  navArrowLeft: {
    position: 'absolute',
    left: 12,
    top: 375, // centers vertically around the 50% container line (raised by 25px)
    width: 48,
    height: 48,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.30)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  navArrowRight: {
    position: 'absolute',
    right: 12,
    top: 375,
    width: 48,
    height: 48,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.30)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  navArrowBottom: {
    position: 'absolute',
    left: '50%',
    transform: [{ translateX: -24 }], // half of 48 width
    width: 48,
    height: 48,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.30)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },

  navArrowText: {
    color: '#EDEAF6',
    fontSize: 22,
    textAlign: 'center',
    marginTop: 0,
    marginBottom: 0,
    paddingVertical: 0,
    lineHeight: 22,
  },
  intentionTopWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 200,
    elevation: 200,
  },
});