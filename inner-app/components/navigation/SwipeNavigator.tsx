import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, FlatList, Dimensions, Pressable, Text, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import SoundscapesScreen from '../../screens/SoundscapesScreen';
import ChambersScreen from '../../screens/ChambersScreen';

const { width: SCREEN_W } = Dimensions.get('window');

type Item = { key: 'soundscapes' | 'chambers'; component: React.ComponentType };

export default function SwipeNavigator({
  initialIndex = 0,
  onIndexChange,
}: {
  initialIndex?: number;
  onIndexChange?: (i: number) => void;
}) {
  const data: Item[] = useMemo(
    () => [
      { key: 'soundscapes', component: SoundscapesScreen },
      { key: 'chambers', component: ChambersScreen },
    ],
    []
  );

  const listRef = useRef<FlatList<Item>>(null);
  const [index, setIndex] = useState(initialIndex);
  const insets = useSafeAreaInsets();

  const go = useCallback(
    async (dir: -1 | 1) => {
      const next = Math.min(data.length - 1, Math.max(0, index + dir));
      if (next === index) return;
      await Haptics.selectionAsync().catch(() => {});
      listRef.current?.scrollToIndex({ index: next, animated: true });
      setIndex(next);
      onIndexChange?.(next);
    },
    [index, data.length, onIndexChange]
  );

  return (
    <View style={styles.container}>
      <FlatList
        ref={listRef}
        data={data}
        keyExtractor={(item) => item.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        getItemLayout={(_, i) => ({ length: SCREEN_W, offset: i * SCREEN_W, index: i })}
        initialScrollIndex={initialIndex}
        onMomentumScrollEnd={e => {
          const i = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
          if (i !== index) {
            setIndex(i);
            onIndexChange?.(i);
          }
        }}
        renderItem={({ item }) => {
          const C = item.component;
          return (
            <View style={{ width: SCREEN_W, height: '100%' }}>
              <C />
            </View>
          );
        }}
      />

      {/* Left / Right arrows */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Previous"
        onPress={() => go(-1)}
        style={[styles.arrow, styles.left, { top: insets.top + 120 }]}
        hitSlop={16}
      >
        <Text style={styles.arrowText}>{'‹'}</Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Next"
        onPress={() => go(1)}
        style={[styles.arrow, styles.right, { top: insets.top + 120 }]}
        hitSlop={16}
      >
        <Text style={styles.arrowText}>{'›'}</Text>
      </Pressable>

      {/* Dots */}
      <View style={[styles.dots, { bottom: insets.bottom + 18 }]}>
        {data.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i === index ? styles.dotActive : undefined,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  arrow: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    zIndex: 10,
  },
  left: { left: 12 },
  right: { right: 12 },
  arrowText: { color: '#EDEAF6', fontSize: 22, lineHeight: 24 },
  dots: {
    position: 'absolute',
    left: 0, right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  dot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  dotActive: { backgroundColor: '#CFC3E0' },
});