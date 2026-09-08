import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from '../core/memorySafeVideo';
import { createJourneyPreview, createPersonalizedLucidJourney, PersonalizedLucidJourneyAnswers, savePersonalizedJourney } from '../core/audio';
import { Typography } from '../core/typography';

const OPTIONS = {
  intention: [['lucidity', 'Lucid recognition'], ['recall', 'Dream recall'], ['calm', 'Calm return'], ['visualization', 'Visualization']],
  durationMinutes: [[5, '5 min'], [10, '10 min'], [20, '20 min'], [30, '30 min']],
  feel: [['gentle', 'Gentle'], ['immersive', 'Immersive'], ['grounded', 'Grounded'], ['minimal', 'Minimal']],
  familiarity: [['new', 'New'], ['familiar', 'Familiar'], ['experienced', 'Experienced']],
} as const;

export default function CreateLucidJourneyScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [answers, setAnswers] = useState<PersonalizedLucidJourneyAnswers>({
    intention: 'lucidity', durationMinutes: 10, feel: 'gentle', familiarity: 'new',
  });
  const [nameModalVisible, setNameModalVisible] = useState(false);
  const [journeyName, setJourneyName] = useState('My Lucid Journey');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 0xffff_ffff) || 1);
  const journey = useMemo(() => createPersonalizedLucidJourney(answers, seed), [answers, seed]);
  const previewJourney = useMemo(() => ({
    ...journey,
    id: `${journey.id}-preview`,
    title: `${journey.title} Preview`,
    durationLabel: '56 sec · Preview',
    summary: `A short preview of ${journey.summary.toLowerCase()}`,
    timeline: createJourneyPreview(journey),
  }), [journey]);
  const background = useVideoPlayer(require('../assets/videos/lucidscreen.mp4'), player => {
    player.loop = true; player.muted = true; player.audioMixingMode = 'mixWithOthers'; player.play();
  });

  const choice = <K extends keyof PersonalizedLucidJourneyAnswers>(key: K, value: PersonalizedLucidJourneyAnswers[K]) => {
    setAnswers(current => ({ ...current, [key]: value }));
    setSaveState('idle');
  };

  const saveJourney = async () => {
    if (!journeyName.trim() || saveState === 'saving') return;
    setSaveState('saving');
    await savePersonalizedJourney(journeyName, journey);
    setSaveState('saved');
    setNameModalVisible(false);
  };

  const group = <K extends keyof typeof OPTIONS>(label: string, key: K) => (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.choices}>
        {OPTIONS[key].map(([value, title]) => {
          const selected = answers[key] === value;
          return (
            <Pressable key={String(value)} onPress={() => choice(key, value as any)} style={[styles.choice, selected && styles.choiceSelected]}>
              <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{title}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      <VideoView player={background} contentFit="cover" style={StyleSheet.absoluteFill} nativeControls={false} allowsFullscreen={false} allowsPictureInPicture={false} />
      <View style={styles.veil} pointerEvents="none" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 102, paddingBottom: insets.bottom + 36 }]}
        showsVerticalScrollIndicator={false}
        alwaysBounceVertical={false}
      >
        <Text
          style={[
            Typography.display,
            styles.title,
            Platform.OS === 'android' && styles.androidTitleOffset,
          ]}
        >
          Create a Journey
        </Text>
        <Text style={[Typography.body, styles.subtitle]}>Shape a practice around the way you want to enter the night.</Text>
        {group('WHAT ARE YOU MOVING TOWARD?', 'intention')}
        {group('HOW MUCH TIME DO YOU HAVE?', 'durationMinutes')}
        {group('HOW SHOULD IT FEEL?', 'feel')}
        {group('YOUR EXPERIENCE', 'familiarity')}
        <Text style={[Typography.body, styles.summary]}>{journey.summary}</Text>
        <Pressable
          onPress={() => {
            setSeed(Math.floor(Math.random() * 0xffff_ffff) || 1);
            setSaveState('idle');
          }}
          style={styles.variation}
          accessibilityRole="button"
          accessibilityLabel="Create another variation of these journey choices"
        >
          <Text style={styles.variationText}>ANOTHER VARIATION</Text>
        </Pressable>
        <Pressable onPress={() => navigation.navigate('LucidJourneyPlayer', { journey })} style={styles.begin} accessibilityRole="button">
          <Text style={styles.beginText}>BEGIN JOURNEY</Text>
        </Pressable>
        <Pressable onPress={() => navigation.navigate('LucidJourneyPlayer', { journey: previewJourney })} style={styles.preview} accessibilityRole="button">
          <Text style={styles.previewText}>PREVIEW 56S</Text>
        </Pressable>
        <Pressable onPress={() => setNameModalVisible(true)} style={styles.save} accessibilityRole="button">
          <Text style={styles.saveText}>{saveState === 'saved' ? 'SAVED' : 'SAVE JOURNEY'}</Text>
        </Pressable>
        <Pressable onPress={() => navigation.goBack()} style={styles.returnButton}><Text style={styles.returnText}>RETURN</Text></Pressable>
      </ScrollView>

      <Modal visible={nameModalVisible} transparent animationType="fade" onRequestClose={() => setNameModalVisible(false)}>
        <KeyboardAvoidingView style={styles.modalRoot} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setNameModalVisible(false)} accessibilityLabel="Close save journey dialog" />
          <View style={styles.modalCard}>
            <Text style={styles.modalLabel}>NAME THIS JOURNEY</Text>
            <TextInput
              value={journeyName}
              onChangeText={setJourneyName}
              autoFocus
              maxLength={40}
              selectTextOnFocus
              returnKeyType="done"
              onSubmitEditing={() => void saveJourney()}
              placeholder="My Lucid Journey"
              placeholderTextColor="#777080"
              style={styles.nameInput}
            />
            <Pressable onPress={() => void saveJourney()} disabled={!journeyName.trim() || saveState === 'saving'} style={styles.modalSave}>
              <Text style={styles.modalSaveText}>{saveState === 'saving' ? 'SAVING…' : 'SAVE'}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#02040B' }, veil: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.58)' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 24 }, title: { color: '#F4F1FA', fontSize: 24, textAlign: 'center' },
  androidTitleOffset: { marginTop: 30 },
  subtitle: { color: '#D7D1E0', fontFamily: 'Inter-ExtraLight', fontSize: 14, lineHeight: 20, textAlign: 'center', width: 280, alignSelf: 'center', marginTop: 8, marginBottom: 24 },
  group: { marginTop: 18 }, label: { color: '#AFA4D5', fontFamily: 'Inter-Medium', fontSize: 9, letterSpacing: 1.4, textAlign: 'center' },
  choices: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 7, marginTop: 9 },
  choice: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(210,198,255,0.2)', backgroundColor: 'rgba(5,7,17,0.4)' },
  choiceSelected: { borderColor: 'rgba(210,198,255,0.62)', backgroundColor: 'rgba(169,149,245,0.22)' },
  choiceText: { color: '#AAA3B6', fontFamily: 'Inter-Light', fontSize: 11 }, choiceTextSelected: { color: '#F0EBFA' },
  summary: { color: '#E6E0EC', fontFamily: 'Inter-ExtraLight', fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 28, paddingHorizontal: 16 },
  variation: { alignSelf: 'center', paddingHorizontal: 18, paddingVertical: 9, marginTop: 8 },
  variationText: { color: '#AFA4D5', fontFamily: 'Inter-Medium', fontSize: 8, letterSpacing: 1.4 },
  begin: { alignSelf: 'center', marginTop: 20, paddingHorizontal: 20, paddingVertical: 13, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(210,198,255,0.5)', backgroundColor: 'rgba(169,149,245,0.2)' },
  beginText: { color: '#F2EDFA', fontFamily: 'Inter-Medium', fontSize: 10, letterSpacing: 1.6 },
  preview: { alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 11, marginTop: 4 },
  previewText: { color: '#C9C2D5', fontFamily: 'Inter-Light', fontSize: 9, letterSpacing: 1.5 },
  save: { alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 10 },
  saveText: { color: '#AFA4D5', fontFamily: 'Inter-Medium', fontSize: 9, letterSpacing: 1.5 },
  returnButton: { alignSelf: 'center', paddingHorizontal: 24, paddingVertical: 13, marginTop: 8 }, returnText: { color: '#E8E2F2', fontFamily: 'Inter-Medium', fontSize: 10, letterSpacing: 2.1 },
  modalRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, backgroundColor: 'rgba(0,0,0,0.66)' },
  modalCard: { width: '100%', maxWidth: 340, paddingHorizontal: 24, paddingVertical: 24, borderRadius: 22, borderWidth: 1, borderColor: 'rgba(210,198,255,0.3)', backgroundColor: 'rgba(10,11,22,0.97)', alignItems: 'center' },
  modalLabel: { color: '#BDAEFF', fontFamily: 'Inter-Medium', fontSize: 9, letterSpacing: 1.6 },
  nameInput: { width: '100%', marginTop: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(210,198,255,0.32)', color: '#F4F0FA', fontFamily: 'Inter-Light', fontSize: 17, textAlign: 'center' },
  modalSave: { marginTop: 20, paddingHorizontal: 24, paddingVertical: 11, borderRadius: 17, backgroundColor: 'rgba(169,149,245,0.22)', borderWidth: 1, borderColor: 'rgba(210,198,255,0.42)' },
  modalSaveText: { color: '#F2EDFA', fontFamily: 'Inter-Medium', fontSize: 9, letterSpacing: 1.6 },
});
