import React from 'react';
import { ImageBackground, StyleSheet, View, Text, Pressable, ScrollView, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SoundscapeCardList from '../components/SoundscapeCardList';
import { Image, PanResponder, GestureResponderEvent, PanResponderGestureState } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { TRACKS, Track } from '../data/tracks';
import { setLastSession } from '../core/session';
import OfflineButton from '../components/OfflineButton';

// Tunables for "stack of 3 then scroll" behavior on the category cards
const CARD_HEIGHT = 96;        // match your SoundscapeCard minHeight
const CARD_GAP = 14;           // vertical space between cards
const VISIBLE_COUNT = 3;       // show 3, scroll for the rest
const LIST_HEIGHT = CARD_HEIGHT * VISIBLE_COUNT + CARD_GAP * (VISIBLE_COUNT - 1);

export default function SoundscapesScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const hasSwipedRef = React.useRef(false);

  const [activeCategory, setActiveCategory] = React.useState<
    null | 'stillness' | 'clarity' | 'renewal' | 'tones' | 'noise'
  >(null);

  const tracks = React.useMemo<Track[]>(() => {
    if (!activeCategory) return [];
    return TRACKS.filter(t => t.category === activeCategory);
  }, [activeCategory]);

  // Predefined quick picks for Noise (wire these ids in data/tracks.ts when ready)
  const specialItems = React.useMemo(() => {
    if (activeCategory === 'noise' && tracks.length === 0) {
      return [
        { id: 'noise_white', title: 'White Noise' },
        { id: 'noise_pink',  title: 'Pink Noise'  },
        { id: 'noise_brown', title: 'Brown Noise' },
        { id: 'noise_grey',  title: 'Grey Noise'  },
      ];
    }
    return [];
  }, [activeCategory, tracks.length]);

  const winH = Dimensions.get('window').height;
  // Reserve space for header + category stack + margins; ensure reasonable min height
  const listMaxHeight = Math.max(180, winH - (Math.max(insets.top + 8, 24) + LIST_HEIGHT + 220));

  const panResponder = React.useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt: GestureResponderEvent, gesture: PanResponderGestureState) => {
        // start responding if a fairly horizontal right swipe begins
        const dx = gesture.dx;
        const dy = gesture.dy;
        return dx > 12 && Math.abs(dy) < 18; 
      },
      onPanResponderMove: (_evt, gesture) => {
        if (!hasSwipedRef.current && gesture.dx > 64 && Math.abs(gesture.dy) < 28) {
          hasSwipedRef.current = true;
          Haptics.selectionAsync();
          // Prefer goBack if this screen is on the stack, otherwise navigate Home
          // @ts-ignore
          if (navigation.canGoBack && (navigation as any).canGoBack()) {
            (navigation as any).goBack();
          } else {
            // @ts-ignore
            navigation.navigate('Home');
          }
        }
      },
      onPanResponderRelease: () => {
        hasSwipedRef.current = false;
      },
      onPanResponderTerminate: () => {
        hasSwipedRef.current = false;
      },
    })
  ).current;

  return (
    <ImageBackground
      source={require('../assets/images/soundscapes-bg-expanded.png')}
      style={styles.container}
      fadeDuration={0}
      resizeMode="contain"
      imageStyle={{ alignSelf: 'flex-start' }}
    >
      {/* subtle top/bottom vignette so cards and text read */}
      <LinearGradient
        colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0.0)', 'rgba(0,0,0,0.55)']}
        style={StyleSheet.absoluteFill}
        locations={[0, 0.5, 1]}
        pointerEvents="none"
      />

      {/* Right arrow to return Home */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to Home"
        onPress={() => { Haptics.selectionAsync(); /* @ts-ignore */ navigation.navigate('Home'); }}
        style={{ position: 'absolute', right: 16, top: '45%', width: 48, height: 48, justifyContent: 'center', alignItems: 'center' }}
        hitSlop={12}
      >
        {/* Replace with your icon asset when available */}
        {/* <Image source={require('../assets/icons/arrow-right.png')} style={{ width: 32, height: 32, opacity: 0.85 }} /> */}
        <Text style={{ color: '#EDE8FA', fontSize: 32, opacity: 0.9 }}>›</Text>
      </Pressable>

      <View style={[styles.topDock, { paddingTop: Math.max(insets.top + 8, 24) }]}> 
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Soundscapes</Text>
          <Text style={styles.subtitle}>Peaceful tones • Noise & frequency • Breath</Text>
        </View>

        {/* Category cards (stack of 3, then scroll) */}
        <View style={[styles.catListContainer, { height: LIST_HEIGHT }]}>
          <SoundscapeCardList
            onSelectCategory={(key) => {
              Haptics.selectionAsync();
              setActiveCategory(key);
            }}
          />
          {/* bottom fade to hint the list continues */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.35)']}
            style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 28 }}
            pointerEvents="none"
          />
        </View>
        {activeCategory && (
          <View style={styles.listWrap}>
            <View style={styles.listHeaderRow}>
              <Text style={styles.listHeaderTitle}>
                {activeCategory === 'stillness'
                  ? 'Stillness'
                  : activeCategory === 'clarity'
                  ? 'Clarity'
                  : activeCategory === 'renewal'
                  ? 'Renewal'
                  : activeCategory === 'tones'
                  ? 'Tones'
                  : 'Noise'}
              </Text>
            </View>

            <ScrollView
              style={{ maxHeight: listMaxHeight }}
              contentContainerStyle={{ gap: 10, paddingBottom: Math.max(insets.bottom, 16) }}
              showsVerticalScrollIndicator={false}
            >
              {(specialItems.length ? specialItems : tracks).map((item: any) => (
                <View key={item.id}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Play ${item.title}`}
                    style={styles.trackRow}
                    onPress={async () => {
                      Haptics.selectionAsync();
                      try { await setLastSession({ type: 'soundscape', id: item.id }); } catch {}
                      // @ts-ignore
                      navigation.navigate('JourneyPlayer', { trackId: item.id });
                    }}
                  >
                    <Text style={styles.trackTitle}>{item.title}</Text>
                    {'description' in item && !!item.description && (
                      <Text style={styles.trackDesc} numberOfLines={2}>{(item as any).description}</Text>
                    )}
                  </Pressable>
                  {'remote' in item && !!item.remote ? (
                    <View style={{ marginTop: 8, marginBottom: 2, paddingHorizontal: 2 }}>
                      <OfflineButton remoteUrl={item.remote} compact />
                    </View>
                  ) : null}
                </View>
              ))}
            </ScrollView>
            <Pressable onPress={() => { Haptics.selectionAsync(); setActiveCategory(null); }} hitSlop={10} style={{ alignSelf: 'flex-end', marginTop: 6 }}>
              <Text style={styles.clearLink}>Clear</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Full-screen right-swipe to go back/navigate Home */}
      <View
        pointerEvents="box-none"
        style={StyleSheet.absoluteFill}
        {...panResponder.panHandlers}
      />
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topDock: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 0,
    paddingHorizontal: 18,
  },
  header: { 
    alignItems: 'center',
    paddingBottom: 10 },
  title: { color: '#EFEAF9', fontSize: 24, fontWeight: '700', letterSpacing: 0.5 },
  subtitle: { color: '#CBC6D9', marginTop: 4 },
  listWrap: {
    marginTop: 12,
    paddingBottom: 24,
  },
  listHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    marginBottom: 2,
  },
  listHeaderTitle: {
    color: '#EDE8FA',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
    opacity: 0.9,
  },
  clearLink: {
    color: '#B7B0CA',
    fontSize: 12,
    textDecorationLine: 'underline',
    opacity: 0.9,
  },
  trackRow: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)'
  },
  trackTitle: {
    color: '#EDE8FA',
    fontSize: 15,
    fontWeight: '700',
  },
  trackDesc: {
    color: 'rgba(237,232,250,0.75)',
    fontSize: 12,
    marginTop: 4,
  },
  catListContainer: {
    position: 'relative',
    marginTop: 10,
    overflow: 'hidden',
  },
});