import React from 'react';
import { ImageBackground, StyleSheet, View, Text, Pressable, FlatList } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { setLastSession } from '../core/session';

const CHAMBERS = [
  { id: 'chamber_one', label: 'Chamber 1 • Outer Sanctum', colors: ['#1b1017', '#5a3b2e'] },
  { id: 'chamber_two', label: 'Chamber 2 • Inner Flame',    colors: ['#0f1c2d', '#3c4a6e'] },
  { id: 'chamber_three', label: 'Chamber 3 • Horizon Gate',      colors: ['#24171a', '#6a3a2c'] },
  { id: 'chamber_four', label: 'Chamber 4 • Crossing',     colors: ['#0e1a1f', '#205055'] },
  { id: 'chamber_five', label: 'Chamber 5 • Ascent',       colors: ['#171314', '#5b4a26'] },
  { id: 'chamber_six', label: 'Chamber 6 • Liminal',      colors: ['#171b2a', '#364a6a'] },
  { id: 'chamber_seven', label: 'Chamber 7 • Return',       colors: ['#20161c', '#51352a'] },
];

function toTrackId(tileId: string) {
  // accept dashes/underscores/numerals and normalize to our track ids
  const id = tileId.replace(/-/g, '_').toLowerCase();
  if (id === 'chamber1' || id === 'chamber_1') return 'chamber_one';
  if (id === 'chamber2' || id === 'chamber_2') return 'chamber_two';
  if (id === 'chamber3' || id === 'chamber_3') return 'chamber_three';
  if (id === 'chamber4' || id === 'chamber_4') return 'chamber_four';
  if (id === 'chamber5' || id === 'chamber_5') return 'chamber_five';
  if (id === 'chamber6' || id === 'chamber_6') return 'chamber_six';
  if (id === 'chamber7' || id === 'chamber_7') return 'chamber_seven';
  return id; // already normalized
}

export default function ChambersScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  return (
    <ImageBackground
      source={require('../assets/images/chambers-bg-expanded.png')}
      style={styles.container}
      fadeDuration={0}
      resizeMode="cover"
    >
      <LinearGradient
        colors={['rgba(0,0,0,0.42)', 'rgba(0,0,0,0.0)', 'rgba(0,0,0,0.55)']}
        style={StyleSheet.absoluteFill}
        locations={[0, 0.5, 1]}
      />

      <Pressable
        accessibilityRole="button"
                accessibilityLabel="Back to Home"
                onPress={() => { Haptics.selectionAsync(); /* @ts-ignore */ navigation.navigate('Home'); }}
                style={{ position: 'absolute', left: 16, top: '45%', width: 48, height: 48, justifyContent: 'center', alignItems: 'center' }}
                hitSlop={12}
      >
        <Text style={{ color: '#EDE8FA', fontSize: 32, opacity: 0.9 }}>‹</Text>
      </Pressable>

      <View style={[styles.header, { paddingTop: Math.max(insets.top + 8, 20) }]}>
        <Text style={styles.title}>Chambers</Text>
        <Text style={styles.subtitle}>Guided journeys • Deeper states</Text>
      </View>

      <FlatList
        data={CHAMBERS}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Tile
            label={item.label}
            onPress={async () => {
              Haptics.selectionAsync();
              const trackId = toTrackId(item.id);
              try { await setLastSession({ type: 'journey', id: trackId }); } catch {}
              // @ts-ignore
              navigation.navigate('JourneyPlayer', { trackId });
            }}
            colors={item.colors}
          />
        )}
        showsVerticalScrollIndicator={false}
        // Viewport shows ~3 tiles; user can scroll for more
        style={styles.list}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 12, 20), gap: 12 }}
      />
    </ImageBackground>
  );
}

function Tile({ label, onPress, colors }: { label: string; onPress: () => void; colors: string[] }) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.tile}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <LinearGradient
        colors={[colors[0], colors[1], 'transparent']}
        locations={[0, 0.82, 1]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.tileFill}
      />
      <Text style={styles.tileText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  backButton: {
    position: 'absolute',
    left: 18,
    top: '50%',
    transform: [{ translateY: -14 }],
    zIndex: 10,
  },
  header: {
    position: 'absolute',
    top: 28,
    left: 18,
    right: 18,
    alignItems: 'center',
  },
  title: { color: '#F3EDE7', fontSize: 24, fontWeight: '700', letterSpacing: 0.5 },
  subtitle: { color: '#D9CFC6', marginTop: 4 },
  list: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 32,
    height: 300, // ~3 tiles (3*86 + gaps)
  },
  tile: {
    flex: 1,
    height: 86,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 0,
  },
  tileFill: { ...StyleSheet.absoluteFillObject },
  tileText: {
    color: '#F7F0E9',
    fontWeight: '600',
    letterSpacing: 0.4,
    position: 'absolute',
    left: 14,
    bottom: 12,
  },
});