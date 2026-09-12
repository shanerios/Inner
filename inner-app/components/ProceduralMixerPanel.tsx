import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { Typography } from '../core/typography';
import ProceduralJourneyBuilder from './ProceduralJourneyBuilder';
import {
  deleteMixerPreset,
  createJourneyPreview,
  FACTORY_AUDIO_JOURNEYS,
  FACTORY_MIXER_PRESETS,
  FACTORY_PRESET_CATEGORY_LABELS,
  loadMixerPresets,
  proceduralAudioEngine,
  saveMixerPreset,
} from '../core/audio';
import type { AudioJourneyTimeline, FactoryPresetCategory, MixerPreset, NoiseColor, ProceduralAudioConfig, ProceduralAudioPatch } from '../core/audio';

const NOISES: Array<{ value: NoiseColor | null; label: string }> = [
  { value: null, label: 'Off' },
  { value: 'white', label: 'White' },
  { value: 'pink', label: 'Pink' },
  { value: 'brown', label: 'Brown' },
  { value: 'grey', label: 'Grey' },
];

// Match the existing Garden tone catalog without importing its bundled recordings.
const TONE_FREQUENCIES = [174, 285, 396, 432, 528, 639, 741, 852, 888, 963] as const;

const BINAURAL_PRESETS = [
  { label: 'Delta', hz: 2 },
  { label: 'Theta', hz: 6 },
  { label: 'Alpha', hz: 10 },
  { label: 'Beta', hz: 20 },
  { label: 'Gamma', hz: 40 },
] as const;

type Props = {
  config: ProceduralAudioConfig;
  onPatch: (patch: ProceduralAudioPatch) => void | Promise<void>;
  onAuditionTimeline?: () => void | Promise<void>;
  onAuditionJourney?: (timeline: AudioJourneyTimeline) => void | Promise<void>;
  activeJourney?: AudioJourneyTimeline | null;
  playbackPositionMs?: number;
  isPlaying?: boolean;
  onClose: () => void;
  standalone?: boolean;
};

export default function ProceduralMixerPanel({
  config,
  onPatch,
  onAuditionTimeline,
  onAuditionJourney,
  activeJourney,
  playbackPositionMs = 0,
  isPlaying = false,
  onClose,
  standalone = false,
}: Props) {
  const [draft, setDraft] = useState(config);
  const pendingRef = useRef<ProceduralAudioPatch>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [presets, setPresets] = useState<MixerPreset[]>([]);
  const [factoryCategory, setFactoryCategory] = useState<FactoryPresetCategory>('balanced');
  const [factorySummary, setFactorySummary] = useState('Inner-designed starting points for comfortable layer balance.');
  const [showJourneyBuilder, setShowJourneyBuilder] = useState(false);
  const [spatialSolo, setSpatialSolo] = useState(false);
  const spatialRestoreRef = useRef<Pick<ProceduralAudioConfig,
    'toneGain' | 'binauralGain' | 'noiseColor' | 'noiseGain' | 'environment' | 'environmentGain' | 'templeGain' | 'masterGain'
  > | null>(null);

  useEffect(() => setDraft(config), [config]);
  useEffect(() => { loadMixerPresets().then(setPresets); }, []);
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);
  const previewJourney = useCallback((journey: typeof FACTORY_AUDIO_JOURNEYS[number]) => {
    if (!onAuditionJourney) return;
    const timeline = createJourneyPreview(journey);
    void onAuditionJourney(timeline);
  }, [onAuditionJourney]);

  const startJourney = useCallback((journey: typeof FACTORY_AUDIO_JOURNEYS[number]) => {
    if (!onAuditionJourney) return;
    void onAuditionJourney(journey.timeline);
  }, [onAuditionJourney]);

  const activeGuidance = activeJourney?.guidance
    ?.filter(cue => cue.atMs <= playbackPositionMs)
    .at(-1);

  const flush = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    const patch = pendingRef.current;
    pendingRef.current = {};
    if (Object.keys(patch).length) void onPatch(patch);
  }, [onPatch]);

  const queue = useCallback((patch: ProceduralAudioPatch, immediate = false) => {
    setDraft(current => ({ ...current, ...patch }));
    pendingRef.current = { ...pendingRef.current, ...patch };
    if (immediate) {
      flush();
      return;
    }
    if (timerRef.current) return;
    timerRef.current = setTimeout(flush, 40);
  }, [flush]);

  const toggleSpatialSolo = useCallback(() => {
    if (!spatialSolo) {
      spatialRestoreRef.current = {
        toneGain: draft.toneGain,
        binauralGain: draft.binauralGain,
        noiseColor: draft.noiseColor,
        noiseGain: draft.noiseGain,
        environment: draft.environment,
        environmentGain: draft.environmentGain,
        templeGain: draft.templeGain,
        masterGain: draft.masterGain,
      };
      setSpatialSolo(true);
      queue({ toneGain: 0, binauralGain: 0, noiseColor: draft.noiseColor ?? 'pink', noiseGain: 0.5, environment: 'none', environmentGain: 0, templeGain: 0, masterGain: 0.8 }, true);
      return;
    }
    const restore = spatialRestoreRef.current;
    spatialRestoreRef.current = null;
    setSpatialSolo(false);
    if (restore) queue(restore, true);
  }, [draft, queue, spatialSolo]);

  const previewCue = useCallback(() => {
    proceduralAudioEngine.triggerCue().catch(error => {
      Alert.alert('Preview unavailable', error instanceof Error ? error.message : String(error));
    });
  }, []);

  const startChannelTest = useCallback(() => {
    if (!spatialSolo) {
      spatialRestoreRef.current = {
        toneGain: draft.toneGain,
        binauralGain: draft.binauralGain,
        noiseColor: draft.noiseColor,
        noiseGain: draft.noiseGain,
        environment: draft.environment,
        environmentGain: draft.environmentGain,
        templeGain: draft.templeGain,
        masterGain: draft.masterGain,
      };
      setSpatialSolo(true);
    }
    queue({ spatialMode: 'channelTest', spatialTarget: 'noise', spatialDepth: 0.8, toneGain: 0, binauralGain: 0, noiseColor: 'pink', noiseGain: 0.5, environment: 'none', environmentGain: 0, templeGain: 0, masterGain: 0.8 }, true);
  }, [draft, queue, spatialSolo]);

  const applyPreset = useCallback((preset: MixerPreset) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    pendingRef.current = {};
    setDraft(preset.config);
    void onPatch(preset.config);
  }, [onPatch]);

  const applyFactoryMix = useCallback((patch: ProceduralAudioPatch, summary: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    pendingRef.current = {};
    setDraft(current => ({ ...current, ...patch }));
    setFactorySummary(summary);
    void onPatch(patch);
  }, [onPatch]);

  const saveCurrentMix = useCallback(() => {
    const persist = async (name?: string) => {
      const cleanName = name?.trim();
      if (!cleanName) return;
      setPresets(await saveMixerPreset(cleanName, draft));
    };
    if (Platform.OS === 'ios') {
      Alert.prompt('Save Mix', 'Give this combination a name.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Save', onPress: name => { void persist(name); } },
      ], 'plain-text', `Mix ${presets.length + 1}`);
      return;
    }
    void persist(`Mix ${presets.length + 1}`);
  }, [draft, presets.length]);

  const confirmDelete = useCallback((preset: MixerPreset) => {
    Alert.alert('Delete saved mix?', preset.name, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => setPresets(await deleteMixerPreset(preset.id)) },
    ]);
  }, []);

  const slider = (
    label: string,
    valueLabel: string,
    value: number,
    minimumValue: number,
    maximumValue: number,
    step: number,
    key: 'carrierHz' | 'toneGain' | 'harmonicWarmth' | 'binauralCarrierHz' | 'binauralDeltaHz' | 'binauralGain' | 'noiseGain' | 'environmentGain' | 'templeGain' | 'masterGain',
  ) => (
    <View style={styles.control}>
      <View style={styles.controlHeader}>
        <Text style={[Typography.caption, styles.label]}>{label}</Text>
        <Text style={[Typography.caption, styles.value]}>{valueLabel}</Text>
      </View>
      <Slider
        style={styles.slider}
        minimumValue={minimumValue}
        maximumValue={maximumValue}
        step={step}
        value={value}
        minimumTrackTintColor="#B9A7FF"
        maximumTrackTintColor="rgba(255,255,255,0.18)"
        thumbTintColor="#E8E1FF"
        onValueChange={next => queue({ [key]: next })}
        onSlidingComplete={next => queue({ [key]: next }, true)}
      />
    </View>
  );

  return (
    <View style={[styles.panel, standalone && styles.standalonePanel]}>
      {!standalone ? <View style={styles.heading}>
        <View>
          <Text style={[Typography.title, styles.title]}>Inner Mixer</Text>
          <Text style={[Typography.caption, styles.subtitle]}>Generated in real time</Text>
        </View>
        <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close inner mixer">
          <Text style={styles.close}>×</Text>
        </Pressable>
      </View> : null}

      <ScrollView
        style={[styles.body, standalone && styles.standaloneBody]}
        contentContainerStyle={[styles.bodyContent, standalone && styles.standaloneBodyContent]}
        showsVerticalScrollIndicator
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
      >
      {slider('Solfeggio carrier', `${Math.round(draft.carrierHz)} Hz`, draft.carrierHz, 174, 963, 1, 'carrierHz')}
      <View style={[styles.presetRow, styles.tonePresetRow]}>
        {TONE_FREQUENCIES.map(hz => {
          const active = Math.abs(draft.carrierHz - hz) < 0.01;
          return (
            <Pressable
              key={hz}
              onPress={() => queue({ carrierHz: hz }, true)}
              accessibilityRole="button"
              accessibilityLabel={`Set tone to ${hz} hertz`}
              accessibilityState={{ selected: active }}
              style={[styles.presetPill, styles.tonePresetPill, active && styles.presetPillActive]}
            >
              <Text style={[Typography.caption, styles.presetName, active && styles.presetNameActive]}>{hz} Hz</Text>
            </Pressable>
          );
        })}
      </View>
      {slider('Solfeggio level', `${Math.round(draft.toneGain * 100)}%`, draft.toneGain, 0, 1, 0.01, 'toneGain')}
      {slider('Harmonic warmth', `${Math.round(draft.harmonicWarmth * 100)}%`, draft.harmonicWarmth, 0, 1, 0.01, 'harmonicWarmth')}
      {slider('Binaural carrier', `${Math.round(draft.binauralCarrierHz)} Hz`, draft.binauralCarrierHz, 100, 500, 1, 'binauralCarrierHz')}
      {slider('Binaural difference', `${draft.binauralDeltaHz.toFixed(1)} Hz`, draft.binauralDeltaHz, 0.5, 40, 0.5, 'binauralDeltaHz')}
      <View style={styles.presetRow}>
        {BINAURAL_PRESETS.map(preset => {
          const active = Math.abs(draft.binauralDeltaHz - preset.hz) < 0.01;
          return (
            <Pressable
              key={preset.label}
              onPress={() => queue({ binauralDeltaHz: preset.hz }, true)}
              accessibilityRole="button"
              accessibilityLabel={`${preset.label}, ${preset.hz} hertz`}
              accessibilityState={{ selected: active }}
              style={[styles.presetPill, active && styles.presetPillActive]}
            >
              <Text style={[Typography.caption, styles.presetName, active && styles.presetNameActive]}>{preset.label}</Text>
              <Text style={[Typography.caption, styles.presetHz, active && styles.presetNameActive]}>{preset.hz} Hz</Text>
            </Pressable>
          );
        })}
      </View>
      {slider('Binaural level', `${Math.round(draft.binauralGain * 100)}%`, draft.binauralGain, 0, 1, 0.01, 'binauralGain')}

      <View style={styles.noiseHeader}>
        <Text style={[Typography.caption, styles.label]}>Noise</Text>
        <Text style={[Typography.caption, styles.value]}>{Math.round(draft.noiseGain * 100)}%</Text>
      </View>
      <View style={styles.noiseRow}>
        {NOISES.map(option => {
          const active = draft.noiseColor === option.value;
          return (
            <Pressable
              key={option.label}
              onPress={() => queue({ noiseColor: option.value }, true)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[styles.noisePill, active && styles.noisePillActive]}
            >
              <Text style={[Typography.caption, styles.noiseText, active && styles.noiseTextActive]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {slider('Noise level', `${Math.round(draft.noiseGain * 100)}%`, draft.noiseGain, 0, 1, 0.01, 'noiseGain')}

      <View style={styles.environmentHeader}>
        <Text style={[Typography.caption, styles.label]}>Environment</Text>
        <Text style={[Typography.caption, styles.value]}>{draft.environment === 'ocean' ? 'Ocean' : draft.environment === 'wind' ? 'Wind' : draft.environment === 'fire' ? 'Fire' : draft.environment === 'cosmic' ? 'Cosmic' : draft.environment === 'forest' ? 'Forest' : 'Off'}</Text>
      </View>
      <View style={styles.environmentRow}>
        {([{ value: 'none', label: 'Off' }, { value: 'ocean', label: 'Ocean' }, { value: 'wind', label: 'Wind' }, { value: 'fire', label: 'Fire' }, { value: 'cosmic', label: 'Cosmic' }, { value: 'forest', label: 'Forest' }] as const).map(option => {
          const active = draft.environment === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => queue({
                environment: option.value,
                environmentGain: option.value !== 'none' ? Math.max(0.38, draft.environmentGain) : draft.environmentGain,
              }, true)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[styles.environmentPill, active && styles.noisePillActive]}
            >
              <Text style={[Typography.caption, styles.noiseText, active && styles.noiseTextActive]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {slider('Environment level', `${Math.round(draft.environmentGain * 100)}%`, draft.environmentGain, 0, 1, 0.01, 'environmentGain')}
      {draft.environment !== 'none' ? (
        <View style={styles.characterRow}>
          <Text style={[Typography.caption, styles.characterLabel]}>Character</Text>
          {([
            { label: 'Calm', value: 0.15 },
            { label: 'Natural', value: 0.5 },
            { label: 'Intense', value: 0.9 },
          ] as const).map(option => {
            const active = Math.abs(draft.environmentIntensity - option.value) < 0.08;
            return (
              <Pressable
                key={option.label}
                onPress={() => queue({ environmentIntensity: option.value }, true)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[styles.speedPill, active && styles.speedPillActive]}
              >
                <Text style={[Typography.caption, styles.speedText, active && styles.speedTextActive]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {slider('Temple resonance', `${Math.round(draft.templeGain * 100)}%`, draft.templeGain, 0, 1, 0.01, 'templeGain')}
      {draft.templeGain > 0 ? (
        <View style={styles.characterRow}>
          <Text style={[Typography.caption, styles.characterLabel]}>Character</Text>
          {([
            { label: 'Calm', value: 0.15 },
            { label: 'Natural', value: 0.5 },
            { label: 'Intense', value: 0.9 },
          ] as const).map(option => {
            const active = Math.abs(draft.templeIntensity - option.value) < 0.08;
            return (
              <Pressable
                key={option.label}
                onPress={() => queue({ templeIntensity: option.value }, true)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[styles.speedPill, active && styles.speedPillActive]}
              >
                <Text style={[Typography.caption, styles.speedText, active && styles.speedTextActive]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {slider('Master level', `${Math.round(draft.masterGain * 100)}%`, draft.masterGain, 0, 1, 0.01, 'masterGain')}

      <View style={styles.environmentHeader}>
        <Text style={[Typography.caption, styles.label]}>Lucidity cue</Text>
        <Pressable
          onPress={previewCue}
          accessibilityRole="button"
          accessibilityLabel="Preview the lucidity cue"
          style={styles.soloButton}
        >
          <Text style={[Typography.caption, styles.soloText]}>Preview</Text>
        </Pressable>
      </View>

      <View style={styles.spatialHeader}>
        <Text style={[Typography.caption, styles.label]}>Spatial movement</Text>
        <View style={styles.spatialHeaderActions}>
          <Pressable
            onPress={startChannelTest}
            accessibilityRole="button"
            accessibilityLabel="Run left right channel test"
            style={[styles.soloButton, draft.spatialMode === 'channelTest' && styles.soloButtonActive]}
          >
            <Text style={[Typography.caption, styles.soloText, draft.spatialMode === 'channelTest' && styles.soloTextActive]}>L/R Test</Text>
          </Pressable>
          <Pressable
            onPress={toggleSpatialSolo}
            accessibilityRole="button"
            accessibilityState={{ selected: spatialSolo }}
            style={[styles.soloButton, spatialSolo && styles.soloButtonActive]}
          >
            <Text style={[Typography.caption, styles.soloText, spatialSolo && styles.soloTextActive]}>
              {spatialSolo ? 'Noise soloed' : 'Solo noise'}
            </Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.spatialRow}>
        {([
          { mode: 'still', label: 'Still', depth: 0, rate: 0.3 },
          { mode: 'drift', label: 'Drift', depth: 0.58, rate: 0.75 },
          { mode: 'pendulum', label: 'Pendulum', depth: 0.78, rate: 1.5 },
          { mode: 'swoosh', label: 'Swoosh', depth: 0.8, rate: 1.5 },
          { mode: 'rain', label: 'Rain', depth: 0.72, rate: 1.2 },
          { mode: 'orbit', label: 'Orbit', depth: 0.76, rate: 1.2 },
          { mode: 'vortex', label: 'Vortex', depth: 0.78, rate: 1.0 },
        ] as const).map(option => {
          const active = draft.spatialMode === option.mode;
          return (
            <Pressable
              key={option.mode}
              onPress={() => queue({
                spatialMode: option.mode,
                spatialTarget: option.mode === 'orbit' || option.mode === 'vortex' ? 'both' : 'noise',
                spatialDepth: option.depth,
                spatialRate: option.rate,
                ...(option.mode === 'still' ? {} : {
                  noiseColor: draft.noiseColor ?? 'pink',
                  noiseGain: Math.max(0.28, draft.noiseGain),
                }),
              }, true)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[styles.noisePill, styles.spatialModePill, active && styles.noisePillActive]}
            >
              <Text style={[Typography.caption, styles.noiseText, active && styles.noiseTextActive]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {draft.spatialMode !== 'still' ? (
        <View style={styles.spatialSpeedRow}>
          <Text style={[Typography.caption, styles.spatialSpeedLabel]}>Speed</Text>
          {([
            { label: 'Slow', rate: 0.75 },
            { label: 'Medium', rate: 1.5 },
            { label: 'Fast', rate: 3 },
          ] as const).map(speed => {
            const active = Math.abs(draft.spatialRate - speed.rate) < 0.01;
            return (
              <Pressable
                key={speed.label}
                onPress={() => queue({ spatialRate: speed.rate }, true)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[styles.speedPill, active && styles.speedPillActive]}
              >
                <Text style={[Typography.caption, styles.speedText, active && styles.speedTextActive]}>{speed.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      <Text style={[Typography.caption, styles.spatialHint]}>Use headphones · audition settings are intentionally noticeable</Text>

      <Text style={[Typography.caption, styles.sectionLabel]}>Starting points</Text>
      <View style={styles.categoryRow}>
        {(Object.keys(FACTORY_PRESET_CATEGORY_LABELS) as FactoryPresetCategory[]).map(category => {
          const active = factoryCategory === category;
          return (
            <Pressable
              key={category}
              onPress={() => {
                setFactoryCategory(category);
                setFactorySummary(category === 'balanced'
                  ? 'Inner-designed starting points for comfortable layer balance.'
                  : category === 'research'
                    ? 'Published signal configurations. Parameters are reproduced without promising the study outcome.'
                    : 'Patent- and community-informed interpretations, not authenticated Gateway or Hemi-Sync reproductions.');
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={[styles.categoryPill, active && styles.categoryPillActive]}
            >
              <Text style={[Typography.caption, styles.categoryText, active && styles.categoryTextActive]}>
                {FACTORY_PRESET_CATEGORY_LABELS[category]}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.savedRow}>
        {FACTORY_MIXER_PRESETS.filter(mix => mix.category === factoryCategory).map(mix => (
          <Pressable
            key={mix.label}
            onPress={() => applyFactoryMix(mix.patch, mix.summary)}
            accessibilityRole="button"
            accessibilityLabel={`Apply ${mix.label} mix`}
            style={[styles.savedPill, styles.factoryPill]}
          >
            <Text numberOfLines={1} style={[Typography.caption, styles.savedText]}>{mix.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <Text style={[Typography.caption, styles.factorySummary]}>{factorySummary}</Text>
      {onAuditionTimeline ? (
        <Pressable
          onPress={() => { void onAuditionTimeline(); }}
          accessibilityRole="button"
          accessibilityLabel="Audition forty second evolving mix prototype"
          style={styles.auditionButton}
        >
          <Text style={[Typography.caption, styles.auditionTitle]}>▶ Audition 40s Flow</Text>
          <Text style={[Typography.caption, styles.auditionSubtitle]}>Design prototype · native timed stages</Text>
        </Pressable>
      ) : null}

      {onAuditionJourney ? (
        <View style={styles.factoryJourneys}>
          <Text style={[Typography.caption, styles.sectionLabel]}>Lucid journey prototypes</Text>
          {FACTORY_AUDIO_JOURNEYS.map(journey => (
            <View key={journey.id} style={styles.journeyCard}>
              <View style={styles.journeyCopy}>
                <Text style={[Typography.caption, styles.auditionTitle]}>{journey.title}</Text>
                <Text style={[Typography.caption, styles.journeyDuration]}>{journey.durationLabel}</Text>
                <Text style={[Typography.caption, styles.auditionSubtitle]}>{journey.summary}</Text>
                <View style={styles.journeyActions}>
                  {journey.id === 'lucid-return-wbtb' ? (
                    <Pressable
                      onPress={() => startJourney(journey)}
                      accessibilityRole="button"
                      accessibilityLabel={`Begin full ${journey.title} journey`}
                      style={[styles.journeyAction, styles.journeyActionPrimary]}
                    >
                      <Text style={[Typography.caption, styles.journeyActionPrimaryText]}>Begin 8 min</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    onPress={() => previewJourney(journey)}
                    accessibilityRole="button"
                    accessibilityLabel={`Preview ${journey.title}`}
                    style={styles.journeyAction}
                  >
                    <Text style={[Typography.caption, styles.journeyActionText]}>Preview 56s</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ))}
          {activeGuidance ? (
            <View style={styles.guidanceCard} accessibilityLiveRegion="polite">
              <Text style={[Typography.caption, styles.guidanceHeading]}>
                {activeGuidance.heading}{isPlaying ? '' : ' · Paused'}
              </Text>
              <Text style={[Typography.body, styles.guidancePrompt]}>{activeGuidance.prompt}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {onAuditionJourney ? (
        <>
          <Pressable
            onPress={() => setShowJourneyBuilder(value => !value)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showJourneyBuilder }}
            style={styles.builderToggle}
          >
            <Text style={[Typography.caption, styles.builderToggleText]}>
              {showJourneyBuilder ? 'Hide Journey Builder' : 'Open Journey Builder'}
            </Text>
          </Pressable>
          {showJourneyBuilder ? (
            <ProceduralJourneyBuilder currentConfig={draft} onAudition={onAuditionJourney} />
          ) : null}
        </>
      ) : null}

      <View style={styles.savedHeader}>
        <Text style={[Typography.caption, styles.label]}>Saved mixes</Text>
        <Pressable onPress={saveCurrentMix} accessibilityRole="button" accessibilityLabel="Save current mix" style={styles.saveButton}>
          <Text style={[Typography.caption, styles.saveText]}>＋ Save Mix</Text>
        </Pressable>
      </View>
      {presets.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.savedRow}>
          {presets.map(preset => (
            <Pressable
              key={preset.id}
              onPress={() => applyPreset(preset)}
              onLongPress={() => confirmDelete(preset)}
              delayLongPress={450}
              accessibilityRole="button"
              accessibilityLabel={`Load saved mix ${preset.name}`}
              accessibilityHint="Long press to delete"
              style={styles.savedPill}
            >
              <Text numberOfLines={1} style={[Typography.caption, styles.savedText]}>{preset.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : (
        <Text style={[Typography.caption, styles.emptyText]}>Save a combination for one-tap recall.</Text>
      )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(210,198,255,0.22)',
    backgroundColor: 'rgba(10,8,18,0.94)',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  standalonePanel: { flex: 1, borderRadius: 0, borderWidth: 0, backgroundColor: 'transparent', paddingHorizontal: 18, paddingTop: 0, paddingBottom: 0 },
  heading: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 },
  body: { maxHeight: 390 },
  bodyContent: { paddingBottom: 8 },
  standaloneBody: { flex: 1, maxHeight: undefined },
  standaloneBodyContent: { paddingBottom: 28 },
  title: { color: '#F0EEF8', fontSize: 17 },
  subtitle: { color: '#8F89A3', marginTop: 1 },
  close: { color: '#CFC7E8', fontSize: 27, lineHeight: 28, paddingHorizontal: 3 },
  control: { marginTop: 5 },
  controlHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { color: '#C9C3D8' },
  value: { color: '#B9A7FF', fontVariant: ['tabular-nums'] },
  slider: { width: '100%', height: 28 },
  noiseHeader: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  presetRow: { flexDirection: 'row', gap: 5, marginTop: 1, marginBottom: 2 },
  presetPill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 5,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(185,167,255,0.14)',
    backgroundColor: 'rgba(185,167,255,0.04)',
  },
  tonePresetRow: { flexWrap: 'wrap', marginBottom: 5 },
  tonePresetPill: { flexBasis: '18%', minHeight: 44, justifyContent: 'center' },
  presetPillActive: { borderColor: '#B9A7FF', backgroundColor: 'rgba(185,167,255,0.2)' },
  presetName: { color: '#AAA3B8', fontSize: 9 },
  presetHz: { color: '#746E82', fontSize: 8, marginTop: 1, fontVariant: ['tabular-nums'] },
  presetNameActive: { color: '#F0EBFF' },
  noiseRow: { flexDirection: 'row', gap: 5, marginTop: 7 },
  environmentHeader: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  environmentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 7 },
  environmentPill: {
    flexGrow: 1,
    flexBasis: '30%',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  characterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 5, marginTop: 3, marginBottom: 3 },
  characterLabel: { color: '#8F89A3', fontSize: 8, marginRight: 2 },
  noisePill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  noisePillActive: { borderColor: '#A995F5', backgroundColor: 'rgba(169,149,245,0.22)' },
  noiseText: { color: '#918B9E', fontSize: 10 },
  noiseTextActive: { color: '#EEE9FF' },
  spatialHeader: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  spatialHeaderActions: { flexDirection: 'row', gap: 5 },
  soloButton: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 9, borderWidth: 1, borderColor: 'rgba(185,167,255,0.16)' },
  soloButtonActive: { borderColor: '#B9A7FF', backgroundColor: 'rgba(185,167,255,0.2)' },
  soloText: { color: '#8F89A3', fontSize: 8 },
  soloTextActive: { color: '#F0EBFF' },
  spatialRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 6 },
  spatialModePill: { flexBasis: '30%' },
  spatialSpeedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 5, marginTop: 6 },
  spatialSpeedLabel: { color: '#8F89A3', fontSize: 8, marginRight: 2 },
  speedPill: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 9, borderWidth: 1, borderColor: 'rgba(185,167,255,0.14)' },
  speedPillActive: { borderColor: '#B9A7FF', backgroundColor: 'rgba(185,167,255,0.2)' },
  speedText: { color: '#817A90', fontSize: 8 },
  speedTextActive: { color: '#F0EBFF' },
  spatialHint: { color: '#746E82', fontSize: 8, marginTop: 4 },
  sectionLabel: { color: '#8F89A3', marginTop: 6 },
  categoryRow: { flexDirection: 'row', gap: 5, marginTop: 5 },
  categoryPill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  categoryPillActive: { borderColor: 'rgba(185,167,255,0.55)', backgroundColor: 'rgba(185,167,255,0.14)' },
  categoryText: { color: '#817A90', fontSize: 8 },
  categoryTextActive: { color: '#E8E1FF' },
  factorySummary: { color: '#777181', fontSize: 8, lineHeight: 11, marginTop: 2 },
  auditionButton: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(169,149,245,0.34)',
    backgroundColor: 'rgba(169,149,245,0.12)',
  },
  auditionTitle: { color: '#E8E1FF', fontSize: 10 },
  auditionSubtitle: { color: '#817A90', fontSize: 8, marginTop: 2 },
  factoryJourneys: { marginTop: 8 },
  journeyCard: { flexDirection: 'row', alignItems: 'center', marginTop: 6, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(169,149,245,0.24)', backgroundColor: 'rgba(169,149,245,0.08)' },
  journeyCopy: { flex: 1, paddingRight: 8 },
  journeyDuration: { color: '#B9A7FF', fontSize: 8, marginTop: 2 },
  journeyActions: { flexDirection: 'row', gap: 6, marginTop: 8 },
  journeyAction: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 9, borderWidth: 1, borderColor: 'rgba(185,167,255,0.24)' },
  journeyActionPrimary: { backgroundColor: 'rgba(185,167,255,0.18)', borderColor: 'rgba(185,167,255,0.48)' },
  journeyActionText: { color: '#AFA7C3', fontSize: 8 },
  journeyActionPrimaryText: { color: '#EEE9FF', fontSize: 8 },
  guidanceCard: { marginTop: 8, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 12, backgroundColor: 'rgba(8,7,15,0.9)', borderWidth: 1, borderColor: 'rgba(210,198,255,0.2)' },
  guidanceHeading: { color: '#B9A7FF', fontSize: 9, letterSpacing: 0.8, textTransform: 'uppercase' },
  guidancePrompt: { color: '#EEEAF8', fontSize: 12, lineHeight: 17, marginTop: 4 },
  builderToggle: { alignItems: 'center', paddingVertical: 8, marginTop: 5 },
  builderToggleText: { color: '#B9A7FF', fontSize: 9 },
  savedHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 5 },
  saveButton: { paddingVertical: 5, paddingLeft: 12 },
  saveText: { color: '#B9A7FF', fontSize: 10 },
  savedRow: { gap: 6, paddingTop: 5, paddingBottom: 2 },
  savedPill: {
    maxWidth: 130,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(185,167,255,0.2)',
    backgroundColor: 'rgba(185,167,255,0.08)',
  },
  factoryPill: { borderColor: 'rgba(207,195,224,0.24)', backgroundColor: 'rgba(207,195,224,0.09)' },
  savedText: { color: '#DCD5F0', fontSize: 10 },
  emptyText: { color: '#746E82', fontSize: 9, marginTop: 3 },
});
