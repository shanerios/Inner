import React, { useCallback, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from '../core/memorySafeVideo';
import { deletePersonalizedJourney, FACTORY_AUDIO_JOURNEYS, loadPersonalizedJourneys, SavedPersonalizedJourney } from '../core/audio';
import { Typography } from '../core/typography';

export default function LucidJourneysScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [expandedJourneyId, setExpandedJourneyId] = useState<string | null>(null);
  const [savedJourneys, setSavedJourneys] = useState<SavedPersonalizedJourney[]>([]);
  const [savedJourneysVisible, setSavedJourneysVisible] = useState(false);
  const background = useVideoPlayer(require('../assets/videos/lucidscreen.mp4'), player => {
    player.loop = true;
    player.muted = true;
    player.audioMixingMode = 'mixWithOthers';
    player.play();
  });

  const lucidReturn = FACTORY_AUDIO_JOURNEYS.find(item => item.id === 'lucid-return-wbtb')!;
  const lucidThreshold = FACTORY_AUDIO_JOURNEYS.find(item => item.id === 'lucid-threshold')!;
  const lucidSignal = FACTORY_AUDIO_JOURNEYS.find(item => item.id === 'lucid-signal')!;

  const begin = (journeyId: string) => navigation.navigate('LucidJourneyPlayer', { journeyId });
  const beginSaved = (journey: SavedPersonalizedJourney) => navigation.navigate('LucidJourneyPlayer', { journey });

  useFocusEffect(useCallback(() => {
    let active = true;
    void loadPersonalizedJourneys().then(journeys => { if (active) setSavedJourneys(journeys); });
    return () => { active = false; };
  }, []));

  const removeSavedJourney = (journey: SavedPersonalizedJourney) => {
    Alert.alert('Remove saved journey?', journey.title, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: () => {
          void deletePersonalizedJourney(journey.id).then(setSavedJourneys);
          setExpandedJourneyId(current => current === journey.id ? null : current);
        },
      },
    ]);
  };

  return (
    <View style={styles.root}>
      <VideoView
        player={background}
        contentFit="cover"
        style={StyleSheet.absoluteFill}
        nativeControls={false}
        allowsFullscreen={false}
        allowsPictureInPicture={false}
      />
      <LinearGradient
        colors={['rgba(2,4,12,0.76)', 'rgba(2,5,14,0.12)', 'rgba(2,4,12,0.92)']}
        locations={[0, 0.42, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 102, paddingBottom: insets.bottom + 28 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.intro, Platform.OS === 'android' && styles.androidTitleOffset]}>
          <Text style={[Typography.display, styles.title]}>Lucid Journeys</Text>
          <Text style={[Typography.body, styles.subtitle]}>
            Practices for carrying awareness across the threshold of sleep.
          </Text>
        </View>

        <View style={[styles.cards, Platform.OS === 'android' && styles.androidCards]}>
          {[lucidReturn, lucidThreshold, lucidSignal].map(journey => {
            const expanded = expandedJourneyId === journey.id;
            return (
              <View key={journey.id} style={styles.journey}>
                <View style={styles.journeyHeading}>
                  <Pressable
                    onPress={() => begin(journey.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Begin ${journey.title}, ${journey.durationLabel}`}
                    style={styles.titleButton}
                  >
                    <Text style={[Typography.display, styles.cardTitle]}>{journey.title}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setExpandedJourneyId(expanded ? null : journey.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`${expanded ? 'Hide' : 'Show'} details for ${journey.title}`}
                    accessibilityState={{ expanded }}
                    style={styles.detailsPill}
                  >
                    <Text style={styles.detailsPillText}>{journey.durationLabel.split(' · ')[0]}</Text>
                    <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={12} color="#CFC5F2" />
                  </Pressable>
                </View>
                {expanded ? (
                  <Text style={[Typography.body, styles.summary]}>{journey.summary}</Text>
                ) : null}
              </View>
            );
          })}
          <Pressable
            onPress={() => navigation.navigate('CreateLucidJourney')}
            accessibilityRole="button"
            accessibilityLabel="Create a personalized lucid journey"
            style={styles.createJourney}
          >
            <Text style={[Typography.display, styles.cardTitle]}>Create a Journey</Text>
            <Text style={styles.createJourneyHint}>PERSONALIZED PRACTICE</Text>
          </Pressable>
          {savedJourneys.length ? (
            <View style={styles.savedSection}>
              <Pressable
                onPress={() => setSavedJourneysVisible(visible => !visible)}
                accessibilityRole="button"
                accessibilityLabel={`${savedJourneysVisible ? 'Hide' : 'Show'} ${savedJourneys.length} saved journeys`}
                accessibilityState={{ expanded: savedJourneysVisible }}
                style={styles.savedHeader}
              >
                <Text style={styles.savedLabel}>SAVED JOURNEYS</Text>
                <View style={styles.savedCountPill}>
                  <Text style={styles.savedCount}>{savedJourneys.length}</Text>
                  <Ionicons name={savedJourneysVisible ? 'chevron-up' : 'chevron-down'} size={12} color="#CFC5F2" />
                </View>
              </Pressable>
              {savedJourneysVisible ? savedJourneys.map(journey => {
                const expanded = expandedJourneyId === journey.id;
                return (
                  <View key={journey.id} style={styles.journey}>
                    <View style={styles.journeyHeading}>
                      <Pressable
                        onPress={() => beginSaved(journey)}
                        accessibilityRole="button"
                        accessibilityLabel={`Begin saved journey ${journey.title}`}
                        style={styles.titleButton}
                      >
                        <Text style={[Typography.display, styles.savedTitle]}>{journey.title}</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setExpandedJourneyId(expanded ? null : journey.id)}
                        accessibilityRole="button"
                        accessibilityLabel={`${expanded ? 'Hide' : 'Show'} details for ${journey.title}`}
                        accessibilityState={{ expanded }}
                        style={styles.detailsPill}
                      >
                        <Text style={styles.detailsPillText}>{journey.durationLabel.split(' · ')[0]}</Text>
                        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={12} color="#CFC5F2" />
                      </Pressable>
                    </View>
                    {expanded ? (
                      <View style={styles.savedDetails}>
                        <Text style={[Typography.body, styles.summary]}>{journey.summary}</Text>
                        <Pressable onPress={() => removeSavedJourney(journey)} accessibilityRole="button" style={styles.removeButton}>
                          <Text style={styles.removeText}>REMOVE</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                );
              }) : null}
            </View>
          ) : null}
        </View>

        <Pressable
          onPress={() => navigation.navigate('LiveMix')}
          accessibilityRole="button"
          accessibilityLabel="Explore Live Mix"
          style={styles.liveMix}
        >
          <Text style={[Typography.display, styles.liveMixText]}>Explore Live Mix</Text>
        </Pressable>
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Return home"
          style={styles.returnButton}
        >
          <Text style={styles.returnText}>RETURN</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#03050D' },
  content: { flexGrow: 1, paddingHorizontal: 22, justifyContent: 'space-between' },
  intro: { alignItems: 'center', paddingHorizontal: 18 },
  androidTitleOffset: { transform: [{ translateY: 30 }] },
  title: { color: '#F5F2FC', fontSize: 24, textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.9)', textShadowRadius: 12 },
  subtitle: { color: '#D6D0DF', fontFamily: 'Inter-ExtraLight', fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 8, maxWidth: 220, textShadowColor: 'rgba(0,0,0,0.95)', textShadowRadius: 10 },
  cards: { flex: 1, justifyContent: 'center', gap: 30, transform: [{ translateY: -30 }] },
  androidCards: { transform: [{ translateY: 0 }] },
  journey: { alignItems: 'center', paddingHorizontal: 12 },
  journeyHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  titleButton: { paddingVertical: 8, paddingLeft: 10 },
  cardTitle: { color: '#F4F0FA', fontSize: 18, textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.95)', textShadowRadius: 10 },
  detailsPill: { minHeight: 27, paddingHorizontal: 9, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(7,9,19,0.58)', borderWidth: 1, borderColor: 'rgba(205,194,255,0.2)' },
  detailsPillText: { color: '#CFC5F2', fontFamily: 'Inter-Medium', fontSize: 9, letterSpacing: 0.4 },
  summary: { color: '#D0CAD8', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 9, maxWidth: 315, textShadowColor: 'rgba(0,0,0,0.95)', textShadowRadius: 8 },
  createJourney: { alignItems: 'center', paddingVertical: 8 },
  createJourneyHint: { color: '#9E94BF', fontFamily: 'Inter-Medium', fontSize: 8, letterSpacing: 1.4, marginTop: 5 },
  savedSection: { alignItems: 'center', gap: 13, marginTop: -4 },
  savedHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 9 },
  savedLabel: { color: '#B5AACF', fontFamily: 'Inter-Medium', fontSize: 9, letterSpacing: 1.5 },
  savedCountPill: { minHeight: 25, paddingHorizontal: 8, borderRadius: 13, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(7,9,19,0.58)', borderWidth: 1, borderColor: 'rgba(205,194,255,0.2)' },
  savedCount: { color: '#CFC5F2', fontFamily: 'Inter-Medium', fontSize: 9 },
  savedTitle: { color: '#EEE9F5', fontSize: 16, textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.95)', textShadowRadius: 10 },
  savedDetails: { alignItems: 'center' },
  removeButton: { paddingHorizontal: 14, paddingVertical: 8, marginTop: 2 },
  removeText: { color: '#A99EAF', fontFamily: 'Inter-Medium', fontSize: 8, letterSpacing: 1.4 },
  liveMix: { alignSelf: 'center', paddingHorizontal: 24, paddingVertical: 13, marginTop: 8, borderRadius: 22, borderWidth: 1, borderColor: 'rgba(205,194,255,0.3)', backgroundColor: 'rgba(7,9,19,0.48)' },
  liveMixText: { color: '#EEE9F5', fontSize: 18, textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.95)', textShadowRadius: 10 },
  returnButton: { alignSelf: 'center', paddingHorizontal: 24, paddingVertical: 13, marginTop: 4 },
  returnText: { color: '#E8E2F2', fontFamily: 'Inter-Medium', fontSize: 10, letterSpacing: 2.1 },
});
