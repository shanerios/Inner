import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Typography } from '../core/typography';
import DreamDetailsEditor from './DreamDetailsEditor';
import type { DreamDetails } from '../core/dreamDetails';
import { normalizeDreamDetails } from '../core/dreamDetails';
import {
  saveLucidSignalMorningCapture,
  saveLucidSignalReflection,
  type DreamRecall,
  type SignalNotice,
  type SleepImpact,
} from '../core/lucidSignalLearning';
import { saveOvernightMorningCapture, saveOvernightReflection } from '../core/journeyMemory';
import { createEntry, getEntry, saveEntry } from '../core/journalRepo';
import type { PendingMorningReturn } from '../core/morningReturn';
import VoiceCaptureButton, { type VoiceRecognitionMode } from './VoiceCaptureButton';
import { buildPracticeContext } from '../core/practiceLinking';
import { saveNightRecord } from '../core/nightRecords';
import { clearSelectedRecommendation } from '../core/recommendationMemory';
import { recordPracticeExperimentOutcome } from '../core/practiceExperiments';

type Props = {
  pending: PendingMorningReturn | null;
  visible: boolean;
  onRequestClose: () => void;
  onResolved: () => void;
};

export default function MorningReturnModal({ pending, visible, onRequestClose, onResolved }: Props) {
  const insets = useSafeAreaInsets();
  const [noticed, setNoticed] = useState<SignalNotice | null>(null);
  const [dreamDetails, setDreamDetails] = useState<DreamDetails | undefined>(undefined);
  const [sleepImpact, setSleepImpact] = useState<SleepImpact | null>(null);
  const [dreamRecall, setDreamRecall] = useState<DreamRecall | null>(null);
  const [step, setStep] = useState<'capture' | 'reflection'>('capture');
  const [capture, setCapture] = useState('');
  const [captureEntryId, setCaptureEntryId] = useState<string | null>(null);
  const [savingCapture, setSavingCapture] = useState(false);
  const [savingReflection, setSavingReflection] = useState(false);
  const [voiceRecognitionMode, setVoiceRecognitionMode] = useState<VoiceRecognitionMode | null>(null);

  useEffect(() => {
    setNoticed(null);
    setDreamDetails(undefined);
    setSleepImpact(null);
    setDreamRecall(pending?.morningCaptureEntryId ? 'dream' : null);
    setStep(pending?.morningCaptureEntryId ? 'reflection' : 'capture');
    setCapture('');
    setCaptureEntryId(pending?.morningCaptureEntryId ?? null);
    setSavingCapture(false);
    setSavingReflection(false);
    setVoiceRecognitionMode(null);
  }, [pending?.id, pending?.morningCaptureEntryId]);

  const captureMorningDream = useCallback(async () => {
    if (!pending || !capture.trim() || savingCapture) return;
    if (pending.preview) {
      setDreamRecall('dream');
      setStep('reflection');
      return;
    }
    setSavingCapture(true);
    let entryId = captureEntryId;
    const capturedAt = Date.now();
    try {
      if (!entryId) {
        const practiceContext = await buildPracticeContext(pending.practiceLink, capturedAt);
        const entry = await createEntry({
          body: capture.trim(),
          kind: 'dream',
          journeySessionId: pending.journeySessionId,
          nightPlanId: pending.nightPlanId,
          captureSource: 'morning_return',
          testSession: pending.testSession,
          practiceContext,
          captureInput: {
            method: voiceRecognitionMode ? 'voice_transcription' : 'morning_quick_capture',
            completedAt: capturedAt,
            recognitionMode: voiceRecognitionMode ?? undefined,
          },
        });
        entryId = entry.id;
        setCaptureEntryId(entry.id);
      }
      if (pending.journeySessionId) {
        await saveOvernightMorningCapture(pending.journeySessionId, entryId);
      } else {
        await saveLucidSignalMorningCapture(pending.id, entryId);
      }
      setDreamRecall('dream');
      setStep('reflection');
    } catch {
      Alert.alert(
        entryId ? 'Dream saved' : 'Dream not saved',
        entryId
          ? 'Your dream is safe in the Journal, but Inner could not link it to this journey yet. Please try again.'
          : 'Your words are still here. Please try again.',
      );
    } finally {
      setSavingCapture(false);
    }
  }, [capture, captureEntryId, pending, savingCapture, voiceRecognitionMode]);

  const continueWithoutRecall = useCallback(() => {
    setDreamRecall('none');
    setDreamDetails(undefined);
    setStep('reflection');
  }, []);

  const submitReflection = useCallback(async () => {
    if (!pending || !dreamRecall || savingReflection) return;
    const details = normalizeDreamDetails({
      ...(dreamRecall === 'none' ? {} : dreamDetails),
      recall: dreamRecall,
      sleepImpact: sleepImpact ?? undefined,
    });
    const reflection = {
      recall: dreamRecall,
      noticed: noticed ?? undefined,
      dreamDetails: details,
      sleepImpact: sleepImpact ?? undefined,
    };
    setSavingReflection(true);
    try {
      const linkedEntryId = captureEntryId ?? pending.morningCaptureEntryId;
      const reflectedAt = Date.now();
      const practiceContext = pending.preview
        ? undefined
        : await buildPracticeContext(pending.practiceLink, reflectedAt);
      if (linkedEntryId && !pending.preview) {
        const linkedEntry = await getEntry(linkedEntryId);
        if (linkedEntry) {
          await saveEntry({
            ...linkedEntry,
            dreamDetails: details,
            practiceContext: linkedEntry.practiceContext ?? practiceContext,
          });
        }
      }
      if (!pending.preview) {
        const source = pending.journeySessionId ? 'overnight_journey' : 'scheduled_signal';
        const nightRecord = await saveNightRecord({
          id: `${source}:${pending.id}`,
          source,
          sourceSessionId: pending.id,
          nightPlanId: pending.nightPlanId,
          scheduledAt: pending.scheduledAt,
          sleepOnsetAt: pending.sleepOnsetAt,
          reviewAt: pending.reviewAt,
          reflectedAt,
          testSession: pending.testSession,
          journalEntryId: linkedEntryId ?? undefined,
          practiceContext,
          outcome: {
            recall: dreamRecall,
            dreamDetails: details,
            signalNotice: noticed ?? undefined,
            sleepImpact: sleepImpact ?? undefined,
          },
        });
        await recordPracticeExperimentOutcome(nightRecord);
      }
      if (pending.journeySessionId) {
        await saveOvernightReflection(pending.journeySessionId, reflection);
      } else if (!pending.preview) {
        await saveLucidSignalReflection(pending.id, reflection);
      }
      if (pending.testSession) {
        try { await clearSelectedRecommendation(); } catch {}
      }
    } catch {
      Alert.alert('Reflection not saved', 'Your answers are still here. Please try again.');
      setSavingReflection(false);
      return;
    }
    setSavingReflection(false);
    onResolved();
  }, [captureEntryId, dreamDetails, dreamRecall, noticed, onResolved, pending, savingReflection, sleepImpact]);

  return (
    <Modal visible={Boolean(pending) && visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <View style={styles.root}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onRequestClose}
          accessibilityRole="button"
          accessibilityLabel="Close morning reflection"
        />
        <View style={[styles.panel, { paddingBottom: insets.bottom + 18 }]}>
          <Pressable
            onPress={onRequestClose}
            accessibilityRole="button"
            accessibilityLabel="Close morning reflection"
            style={styles.close}
          >
            <Ionicons name="close" size={18} color="#CFC5DA" />
          </Pressable>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.content}
          >
            <Text style={styles.eyebrow}>MORNING RETURN</Text>
            <Text style={styles.context}>
              {pending?.preview
                ? 'Preview · answers are not saved'
                : `${pending?.journeySessionId ? 'Overnight journey' : 'Scheduled signals'} · ${new Date(pending?.scheduledAt ?? 0).toLocaleString()}`}
            </Text>
            {step === 'capture' ? (
              <>
                <Text style={[Typography.display, styles.returnTitle]}>You returned. What remains?</Text>
                <Text style={styles.returnCopy}>Capture the dream before details begin to fade.</Text>
                <VoiceCaptureButton
                  value={capture}
                  onChangeText={setCapture}
                  onVoiceUsed={setVoiceRecognitionMode}
                  disabled={!visible || savingCapture}
                  maxLength={12_000}
                />
                <TextInput
                  value={capture}
                  onChangeText={setCapture}
                  multiline
                  maxLength={12_000}
                  placeholder="A scene, feeling, voice, color—anything that remains…"
                  placeholderTextColor="#746D80"
                  accessibilityLabel="Morning dream capture"
                  style={styles.captureInput}
                />
                <Pressable
                  onPress={() => { void captureMorningDream(); }}
                  disabled={!capture.trim() || savingCapture}
                  accessibilityRole="button"
                  accessibilityLabel="Save dream and continue"
                  style={[styles.save, (!capture.trim() || savingCapture) && styles.disabled]}
                >
                  <Text style={styles.saveText}>{savingCapture ? 'SAVING…' : 'SAVE DREAM & CONTINUE'}</Text>
                </Pressable>
                <Pressable onPress={continueWithoutRecall} accessibilityRole="button" style={styles.noRecallButton}>
                  <Text style={styles.noRecallText}>NOTHING RECALLED</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={[Typography.display, styles.reflectionTitle]}>A few quiet questions</Text>
                <ReflectionQuestion
                  prompt="How much did you recall?"
                  options={[
                    { label: 'NONE', value: 'none' },
                    { label: 'A FRAGMENT', value: 'fragment' },
                    { label: 'A DREAM', value: 'dream' },
                  ]}
                  value={dreamRecall}
                  onChange={value => {
                    const recall = value as DreamRecall;
                    setDreamRecall(recall);
                    if (recall === 'none') setDreamDetails(undefined);
                  }}
                />
                <ReflectionQuestion
                  prompt="Did you notice the signal?"
                  options={[
                    { label: 'YES', value: 'yes' },
                    { label: 'UNSURE', value: 'unsure' },
                    { label: 'NO', value: 'no' },
                  ]}
                  value={noticed}
                  onChange={value => setNoticed(value as SignalNotice)}
                />
                {dreamRecall !== 'none' && (
                  <View style={styles.dreamDetails}>
                    <DreamDetailsEditor value={dreamDetails} onChange={setDreamDetails} initiallyExpanded />
                  </View>
                )}
                <ReflectionQuestion
                  prompt="How did it affect your sleep?"
                  options={[
                    { label: 'NOT AT ALL', value: 'none' },
                    { label: 'GENTLY', value: 'gentle' },
                    { label: 'WOKE ME', value: 'woke' },
                  ]}
                  value={sleepImpact}
                  onChange={value => setSleepImpact(value as SleepImpact)}
                />
                <Pressable
                  onPress={() => { void submitReflection(); }}
                  disabled={!dreamRecall || savingReflection}
                  accessibilityRole="button"
                  accessibilityLabel="Save morning reflection"
                  style={[styles.save, (!dreamRecall || savingReflection) && styles.disabled]}
                >
                  <Text style={styles.saveText}>{savingReflection ? 'SAVING…' : 'SAVE REFLECTION'}</Text>
                </Pressable>
              </>
            )}
            <Text style={styles.privateCopy}>Stored privately on this device.</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

type ReflectionQuestionProps = {
  prompt: string;
  options: Array<{ label: string; value: string }>;
  value: string | null;
  onChange: (value: string) => void;
};

function ReflectionQuestion({ prompt, options, value, onChange }: ReflectionQuestionProps) {
  return (
    <View style={styles.question}>
      <Text style={styles.prompt}>{prompt}</Text>
      <View style={styles.options}>
        {options.map(option => (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: value === option.value }}
            style={[styles.option, value === option.value && styles.optionSelected]}
          >
            <Text style={[styles.optionText, value === option.value && styles.optionTextSelected]}>{option.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 22, backgroundColor: 'rgba(1,2,7,0.78)' },
  panel: { width: '100%', maxWidth: 390, maxHeight: '86%', paddingTop: 18, paddingHorizontal: 18, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(185,167,255,0.34)', backgroundColor: 'rgba(5,7,17,0.97)', shadowColor: '#000', shadowOpacity: 0.62, shadowRadius: 24, elevation: 18 },
  close: { position: 'absolute', right: 12, top: 10, zIndex: 2, width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  content: { alignItems: 'center', paddingTop: 12, paddingBottom: 2 },
  eyebrow: { color: '#B8A7EE', fontFamily: 'Inter-Medium', fontSize: 8, letterSpacing: 1.55, textAlign: 'center' },
  context: { color: '#D7D0E0', fontFamily: 'Inter-Light', fontSize: 11, textAlign: 'center', marginBottom: 7 },
  reflectionTitle: { alignSelf: 'stretch', color: '#F1EDF8', fontSize: 17, textAlign: 'center', marginTop: 7, marginBottom: 5, paddingHorizontal: 4 },
  returnTitle: { alignSelf: 'stretch', color: '#F1EDF8', fontSize: 21, lineHeight: 28, textAlign: 'center', marginTop: 8, paddingHorizontal: 4 },
  returnCopy: { maxWidth: 260, color: '#B9B1C4', fontFamily: 'Inter-ExtraLight', fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 7 },
  captureInput: { width: '100%', minHeight: 150, maxHeight: 260, marginTop: 15, paddingHorizontal: 14, paddingVertical: 13, borderRadius: 17, borderWidth: 1, borderColor: 'rgba(205,194,255,0.24)', backgroundColor: 'rgba(12,13,28,0.78)', color: '#EEEAF5', fontFamily: 'Inter-Light', fontSize: 13, lineHeight: 20, textAlignVertical: 'top' },
  noRecallButton: { minHeight: 34, justifyContent: 'center', marginTop: 8, paddingHorizontal: 14 },
  noRecallText: { color: '#91899D', fontFamily: 'Inter-Medium', fontSize: 7, letterSpacing: 1.15 },
  question: { alignItems: 'center', marginTop: 12 },
  prompt: { color: '#D7D0E0', fontFamily: 'Inter-Light', fontSize: 11, textAlign: 'center', marginBottom: 7 },
  options: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 },
  option: { minHeight: 29, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 15, borderWidth: 1, borderColor: 'rgba(205,194,255,0.2)', backgroundColor: 'rgba(15,16,31,0.55)' },
  optionSelected: { borderColor: 'rgba(205,194,255,0.65)', backgroundColor: 'rgba(105,83,171,0.38)' },
  optionText: { color: '#AFA7BB', fontFamily: 'Inter-Medium', fontSize: 7, letterSpacing: 0.9 },
  optionTextSelected: { color: '#F0EAFB' },
  dreamDetails: { alignSelf: 'stretch', marginTop: 16 },
  save: { minHeight: 36, justifyContent: 'center', marginTop: 16, paddingHorizontal: 17, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(205,194,255,0.38)' },
  disabled: { opacity: 0.35 },
  saveText: { color: '#E2D9F7', fontFamily: 'Inter-Medium', fontSize: 8, letterSpacing: 1.35 },
  privateCopy: { color: '#8F879B', fontFamily: 'Inter-ExtraLight', fontSize: 8, marginTop: 8 },
});
