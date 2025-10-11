import React from 'react';
import { SafeAreaView, View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LEARN_TRACKS } from '../../data/learn';

type RouteParams = { trackId: 'lucid' | 'obe' };

export default function LessonList() {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const { trackId } = (route.params || { trackId: 'lucid' }) as RouteParams;

  const track = LEARN_TRACKS[trackId];
  const lessons = track?.lessons ?? [];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.inner}>
        <Text style={styles.kicker}>{trackId === 'lucid' ? 'Lucid Dreaming' : 'OBE Foundations'}</Text>
        <Text style={styles.title}>{track.title}</Text>
        <View style={{ height: 12 }} />
        <Text style={styles.subtitle}>{track.subtitle}</Text>

        <View style={{ height: 16 }} />

        {lessons.map((lesson) => (
          <TouchableOpacity
            key={lesson.id}
            style={styles.lessonCard}
            onPress={() => navigation.navigate('LessonReader', { trackId, lessonId: lesson.id })}
            accessibilityRole="button"
            accessibilityLabel={`Open lesson: ${lesson.title}`}
            accessibilityHint="Navigates to the full lesson"
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.lessonTitle}>{lesson.title}</Text>
              {lesson.summary ? <Text style={styles.lessonSummary}>{lesson.summary}</Text> : null}
            </View>
            <Text style={styles.duration}>{lesson.durationMin}m</Text>
          </TouchableOpacity>
        ))}

        {lessons.length === 0 && (
          <Text style={styles.empty}>
            No lessons found. Add entries in learn/learn.ts under {trackId}.
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  inner: { padding: 24, gap: 12 },
  kicker: { color: '#B9B0EB', letterSpacing: 1, textTransform: 'uppercase', fontSize: 12 },
  title: { color: '#EDE8FA', fontSize: 26, fontWeight: '700', marginTop: 6 },
  subtitle: { color: '#DCD6F5', fontSize: 14, lineHeight: 20 },
  lessonCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(20, 16, 32, 0.55)',
    borderWidth: 1,
    borderColor: 'rgba(185, 176, 235, 0.18)',
    gap: 12,
  },
  lessonTitle: { color: '#EDE8FA', fontSize: 16, fontWeight: '600' },
  lessonSummary: { color: '#CFC8EE', fontSize: 13, lineHeight: 18, marginTop: 4 },
  duration: { color: '#B9B0EB', fontSize: 12, marginLeft: 8, marginTop: 2 },
  empty: { color: '#CFC8EE', opacity: 0.8, marginTop: 24 },
});
