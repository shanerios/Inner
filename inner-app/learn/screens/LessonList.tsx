import React from 'react';
import { SafeAreaView, View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LEARN_TRACKS } from '../../data/learn';
import { Typography, Body as _Body } from '../../core/typography';
import { useLessonProgressMap } from '../../learn/useProgress';
const Body = _Body ?? ({
  regular: { fontFamily: 'Inter-ExtraLight', fontSize: 16 },
  subtle: { fontFamily: 'Inter-ExtraLight', fontSize: 14 },
} as const);

type RouteParams = { trackId: 'lucid' | 'obe' };

export default function LessonList() {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const { trackId } = (route.params || { trackId: 'lucid' }) as RouteParams;

  const track = LEARN_TRACKS[trackId];
  const lessons = track?.lessons ?? [];
  const progressMap = useLessonProgressMap();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.inner}>
        <Text style={[Typography.caption, { color: '#B9B0EB', letterSpacing: 1 }]}>
          {trackId === 'lucid' ? 'Lucid Dreaming' : 'OBE Foundations'}
        </Text>
        <Text style={[Typography.display, { color: '#EDE8FA' }]}>{track.title}</Text>
        <View style={{ height: 12 }} />
        <Text style={[Body.regular, { color: '#DCD6F5', lineHeight: 20 }]}>{track.subtitle}</Text>

        <View style={{ height: 16 }} />

        {lessons.map((lesson) => {
          const p = progressMap[trackId]?.[lesson.id] ?? 0;
          const isCompleted = p >= 0.85;

          return (
            <TouchableOpacity
              key={lesson.id}
              style={styles.lessonCard}
              onPress={() => navigation.navigate('LessonReader', { trackId, lessonId: lesson.id })}
              accessibilityRole="button"
              accessibilityLabel={`Open lesson: ${lesson.title}`}
              accessibilityHint="Navigates to the full lesson"
            >
              <View style={{ flex: 1 }}>
                <Text style={[Typography.title, { color: '#EDE8FA' }]}>{lesson.title}</Text>
                {lesson.summary ? (
                  <Text
                    style={{
                      fontFamily: 'Inter-ExtraLight',
                      fontSize: 13,
                      lineHeight: 18,
                      color: '#CFC8EE',
                      marginTop: 4,
                    }}
                  >
                    {lesson.summary}
                  </Text>
                ) : null}

                {isCompleted && (
                  <View style={styles.completedBadge}>
                    <Text style={styles.completedBadgeText}>Completed</Text>
                  </View>
                )}
              </View>
              <Text
                style={{
                  fontFamily: 'Inter-ExtraLight',
                  fontSize: 12,
                  color: '#B9B0EB',
                  marginLeft: 8,
                  marginTop: 2,
                }}
              >
                {lesson.durationMin}m
              </Text>
            </TouchableOpacity>
          );
        })}

        {lessons.length === 0 && (
          <Text style={{ fontFamily: 'Inter-ExtraLight', fontSize: 14, color: '#CFC8EE', opacity: 0.8, marginTop: 24 }}>
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
  completedBadge: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(151, 220, 174, 0.18)',
  },
  completedBadgeText: {
    ...Typography.caption,
    fontSize: 11,
    color: '#8FE3B3',
  },
});
