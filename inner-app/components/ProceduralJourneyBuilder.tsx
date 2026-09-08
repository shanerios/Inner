import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Typography } from '../core/typography';
import {
  deleteAudioJourney,
  loadAudioJourneys,
  saveAudioJourney,
} from '../core/audio';
import type {
  AudioJourneyStage,
  AudioJourneyTimeline,
  ProceduralAudioConfig,
  SavedAudioJourney,
} from '../core/audio';

const DURATIONS = [10_000, 60_000, 5 * 60_000];
const TRANSITIONS = [0, 5_000, 15_000, 30_000];

const durationLabel = (milliseconds: number) => milliseconds < 60_000
  ? `${milliseconds / 1_000}s`
  : `${milliseconds / 60_000}m`;

type Props = {
  currentConfig: ProceduralAudioConfig;
  onAudition: (timeline: AudioJourneyTimeline) => void | Promise<void>;
};

export default function ProceduralJourneyBuilder({ currentConfig, onAudition }: Props) {
  const [stages, setStages] = useState<AudioJourneyStage[]>([]);
  const [loop, setLoop] = useState(false);
  const [saved, setSaved] = useState<SavedAudioJourney[]>([]);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [title, setTitle] = useState('Untitled Journey');

  useEffect(() => { loadAudioJourneys().then(setSaved); }, []);

  const addStage = useCallback(() => {
    setStages(existing => {
      const number = existing.length + 1;
      return [...existing, {
        id: `stage-${Date.now()}-${number}`,
        label: `Stage ${number}`,
        durationMs: 10_000,
        transitionMs: existing.length ? 5_000 : 2_000,
        target: { ...currentConfig },
      }];
    });
  }, [currentConfig]);

  const updateStage = useCallback((id: string, patch: Partial<AudioJourneyStage>) => {
    setStages(existing => existing.map(stage => stage.id === id ? { ...stage, ...patch } : stage));
  }, []);

  const moveStage = useCallback((index: number, direction: -1 | 1) => {
    setStages(existing => {
      const destination = index + direction;
      if (destination < 0 || destination >= existing.length) return existing;
      const next = [...existing];
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });
  }, []);

  const timeline = useCallback((): AudioJourneyTimeline => ({
    id: loadedId ?? `journey-${Date.now()}`,
    title,
    loop,
    stages,
  }), [loadedId, loop, stages, title]);

  const save = useCallback(() => {
    if (!stages.length) return;
    const persist = async (name?: string) => {
      const clean = name?.trim();
      if (!clean) return;
      const definition = { ...timeline(), title: clean };
      setTitle(clean);
      setLoadedId(definition.id);
      setSaved(await saveAudioJourney(definition));
    };
    if (Platform.OS === 'ios') {
      Alert.prompt('Save Journey', 'Name this sequence.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Save', onPress: name => { void persist(name); } },
      ], 'plain-text', title === 'Untitled Journey' ? `Journey ${saved.length + 1}` : title);
    } else {
      void persist(`Journey ${saved.length + 1}`);
    }
  }, [saved.length, stages.length, timeline, title]);

  const load = useCallback((journey: SavedAudioJourney) => {
    setLoadedId(journey.id);
    setTitle(journey.title);
    setLoop(journey.loop === true);
    setStages(journey.stages);
  }, []);

  const removeSaved = useCallback((journey: SavedAudioJourney) => {
    Alert.alert('Delete journey?', journey.title, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => setSaved(await deleteAudioJourney(journey.id)) },
    ]);
  }, []);

  return (
    <View style={styles.builder}>
      <View style={styles.header}>
        <View>
          <Text style={[Typography.caption, styles.title]}>Journey Builder · Internal</Text>
          <Text style={[Typography.caption, styles.subtitle]}>{title}</Text>
        </View>
        <Pressable onPress={() => setLoop(value => !value)} style={[styles.loop, loop && styles.loopActive]}>
          <Text style={[Typography.caption, styles.loopText]}>{loop ? 'Loop On' : 'Loop Off'}</Text>
        </Pressable>
      </View>

      {stages.map((stage, index) => {
        const durationIndex = Math.max(0, DURATIONS.indexOf(stage.durationMs));
        const transitionIndex = Math.max(0, TRANSITIONS.indexOf(stage.transitionMs ?? 0));
        return (
          <View key={stage.id} style={styles.stage}>
            <View style={styles.stageCopy}>
              <Text style={[Typography.caption, styles.stageTitle]}>{index + 1}. {stage.label}</Text>
              <Text style={[Typography.caption, styles.stageDetail]}>
                {Math.round(stage.target.carrierHz ?? 528)} Hz tone · {Number(stage.target.binauralDeltaHz ?? 4).toFixed(1)} Hz difference
              </Text>
            </View>
            <Pressable onPress={() => updateStage(stage.id, { durationMs: DURATIONS[(durationIndex + 1) % DURATIONS.length] })} style={styles.miniButton}>
              <Text style={styles.miniText}>{durationLabel(stage.durationMs)}</Text>
            </Pressable>
            <Pressable onPress={() => {
              const next = TRANSITIONS[(transitionIndex + 1) % TRANSITIONS.length];
              updateStage(stage.id, { transitionMs: Math.min(next, stage.durationMs) });
            }} style={styles.miniButton}>
              <Text style={styles.miniText}>↝{durationLabel(stage.transitionMs ?? 0)}</Text>
            </Pressable>
            <Pressable onPress={() => moveStage(index, -1)} disabled={index === 0}><Text style={[styles.action, index === 0 && styles.disabled]}>↑</Text></Pressable>
            <Pressable onPress={() => moveStage(index, 1)} disabled={index === stages.length - 1}><Text style={[styles.action, index === stages.length - 1 && styles.disabled]}>↓</Text></Pressable>
            <Pressable onPress={() => setStages(existing => existing.filter(item => item.id !== stage.id))}><Text style={styles.remove}>×</Text></Pressable>
          </View>
        );
      })}

      <View style={styles.actions}>
        <Pressable onPress={addStage} style={styles.primaryButton}><Text style={styles.primaryText}>＋ Add Current Mix</Text></Pressable>
        <Pressable disabled={!stages.length} onPress={() => { void onAudition(timeline()); }} style={[styles.secondaryButton, !stages.length && styles.buttonDisabled]}>
          <Text style={styles.secondaryText}>▶ Audition</Text>
        </Pressable>
        <Pressable disabled={!stages.length} onPress={save} style={[styles.secondaryButton, !stages.length && styles.buttonDisabled]}>
          <Text style={styles.secondaryText}>Save</Text>
        </Pressable>
      </View>

      {saved.length ? (
        <View style={styles.savedList}>
          <Text style={[Typography.caption, styles.savedLabel]}>Saved journeys</Text>
          <View style={styles.savedWrap}>
            {saved.map(journey => (
              <Pressable key={journey.id} onPress={() => load(journey)} onLongPress={() => removeSaved(journey)} style={styles.savedPill}>
                <Text numberOfLines={1} style={styles.savedText}>{journey.title}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  builder: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  title: { color: '#E8E1FF', fontSize: 10 },
  subtitle: { color: '#817A90', fontSize: 8, marginTop: 1 },
  loop: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 9, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  loopActive: { borderColor: '#A995F5', backgroundColor: 'rgba(169,149,245,0.18)' },
  loopText: { color: '#CFC7E8', fontSize: 8 },
  stage: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  stageCopy: { flex: 1, minWidth: 80 },
  stageTitle: { color: '#DCD5F0', fontSize: 9 },
  stageDetail: { color: '#777181', fontSize: 7, marginTop: 1 },
  miniButton: { paddingHorizontal: 5, paddingVertical: 4, borderRadius: 7, backgroundColor: 'rgba(255,255,255,0.06)' },
  miniText: { color: '#AAA3B8', fontSize: 7 },
  action: { color: '#B9A7FF', fontSize: 15, paddingHorizontal: 2 },
  remove: { color: '#C99BA8', fontSize: 17, paddingLeft: 2 },
  disabled: { opacity: 0.2 },
  actions: { flexDirection: 'row', gap: 5, marginTop: 8 },
  primaryButton: { flex: 1.5, alignItems: 'center', paddingVertical: 7, borderRadius: 9, backgroundColor: 'rgba(169,149,245,0.2)' },
  primaryText: { color: '#EEE9FF', fontSize: 8 },
  secondaryButton: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 9, borderWidth: 1, borderColor: 'rgba(169,149,245,0.3)' },
  secondaryText: { color: '#CFC7E8', fontSize: 8 },
  buttonDisabled: { opacity: 0.3 },
  savedList: { marginTop: 8 },
  savedLabel: { color: '#817A90', fontSize: 8 },
  savedWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 4 },
  savedPill: { maxWidth: 130, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)' },
  savedText: { color: '#CFC7E8', fontSize: 8 },
});
