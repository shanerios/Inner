import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as Application from 'expo-application';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { JourneyMemoryEvent, JourneyMemorySession, JourneyMemoryState } from '../core/journeyMemory';
import { loadJourneyMemory } from '../core/journeyMemory';
import {
  buildPlaybackDiagnosticsExport,
  serializePlaybackDiagnostics,
} from '../core/playbackDiagnostics';

const EMPTY_MEMORY: JourneyMemoryState = { schemaVersion: 2, sessions: [] };

function formatDuration(ms?: number): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  const totalMinutes = Math.max(0, Math.round(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function describeEvent(event: JourneyMemoryEvent): string {
  switch (event.type) {
    case 'started': return 'Journey started';
    case 'stage_changed': return `Stage changed${event.stageId ? ` · ${event.stageId}` : ''}`;
    case 'cue_played': return `Cue played${event.cueId ? ` · ${event.cueId}` : ''}`;
    case 'recognition_signal_selected': return `Signal selected${event.signalId ? ` · ${event.signalId}` : ''}`;
    case 'recognition_signal_fired': {
      const drift = event.driftMs == null ? '' : ` · drift ${Math.round(event.driftMs)} ms`;
      return `Signal fired${event.signalId ? ` · ${event.signalId}` : ''}${drift}`;
    }
    case 'seeked': return `Seeked from ${formatTime(event.fromPositionMs ?? 0)}`;
    case 'app_state_changed': return `App state · ${event.appState ?? 'unknown'}`;
    case 'playback_paused': return `Playback paused${event.reason ? ` · ${event.reason}` : ''}`;
    case 'playback_resumed': return `Playback resumed${event.reason ? ` · ${event.reason}` : ''}`;
    case 'audio_route_changed': return `Audio route changed${event.route ? ` · ${event.route}` : ''}`;
    case 'interruption_began': return `Interruption began${event.reason ? ` · ${event.reason}` : ''}`;
    case 'interruption_ended': return `Interruption ended${event.reason ? ` · ${event.reason}` : ''}`;
    case 'audio_underrun': return `Audio buffer underrun · count ${event.underrunCount ?? 'unknown'}`;
    case 'completed': return 'Journey completed';
    case 'user_stopped': return `Stopped by user${event.reason ? ` · ${event.reason}` : ''}`;
    case 'recovered_interrupted': return `Recovered after interruption${event.message ? ` · ${event.message}` : ''}`;
    case 'abandoned_interrupted': return `Abandoned after interruption${event.message ? ` · ${event.message}` : ''}`;
    case 'os_terminated': return `Ended by the OS${event.message ? ` · ${event.message}` : ''}`;
    case 'unknown': return `Ended, reason unknown${event.message ? ` · ${event.message}` : ''}`;
    case 'error': return `Playback error${event.message ? ` · ${event.message}` : ''}`;
    default: return event.type;
  }
}

function outcomeLabel(session: JourneyMemorySession): string {
  if (session.outcome === 'completed') return 'Completed';
  if (session.outcome === 'failed') return 'Failed';
  if (session.outcome === 'user_stopped') return 'Stopped by user';
  if (session.outcome === 'recovered_interrupted') return 'Recovered after interruption';
  if (session.outcome === 'abandoned_interrupted') return 'Abandoned after interruption';
  if (session.outcome === 'os_terminated') return 'Ended by the OS';
  if (session.outcome === 'unknown') return 'Ended, reason unknown';
  return 'In progress or interrupted';
}

export default function PlaybackDiagnosticsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [memory, setMemory] = useState<JourneyMemoryState>(EMPTY_MEMORY);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const next = await loadJourneyMemory();
    setMemory(next);
    setSelectedId(current => current && next.sessions.some(session => session.id === current)
      ? current
      : next.sessions[0]?.id ?? null);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => {
    void refresh();
  }, [refresh]));

  const selected = useMemo(
    () => memory.sessions.find(session => session.id === selectedId) ?? null,
    [memory.sessions, selectedId],
  );

  const exportDiagnostics = useCallback(async () => {
    if (exporting || memory.sessions.length === 0) return;
    setExporting(true);
    try {
      const generatedAt = Date.now();
      const data = serializePlaybackDiagnostics(buildPlaybackDiagnosticsExport(memory, {
        version: Application.nativeApplicationVersion,
        build: Application.nativeBuildVersion,
        platform: Platform.OS,
      }, generatedAt));
      const filename = `inner-playback-diagnostics-${new Date(generatedAt).toISOString().replace(/[:.]/g, '-')}.json`;

      if (FileSystem.cacheDirectory && await Sharing.isAvailableAsync()) {
        const uri = `${FileSystem.cacheDirectory}${filename}`;
        await FileSystem.writeAsStringAsync(uri, data);
        await Sharing.shareAsync(uri, {
          mimeType: 'application/json',
          dialogTitle: 'Export Inner Playback Diagnostics',
          UTI: 'public.json',
        });
      } else {
        await Share.share({ title: 'Inner Playback Diagnostics', message: data });
      }
    } catch {
      Alert.alert('Could not share', 'Inner created the playback report but could not open the selected sharing destination.');
    } finally {
      setExporting(false);
    }
  }, [exporting, memory]);

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.headerButton}
        >
          <Text style={styles.headerButtonText}>‹</Text>
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Playback Diagnostics</Text>
          <Text style={styles.subtitle}>Audio events stored on this device</Text>
        </View>
        <Pressable onPress={refresh} accessibilityRole="button" style={styles.refreshButton}>
          <Text style={styles.refreshText}>Refresh</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 88, paddingBottom: insets.bottom + 28 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.privacyCard}>
          <Text style={styles.privacyTitle}>Private by default</Text>
          <Text style={styles.privacyText}>
            These records stay on your device. Exports include playback timing and audio events, but exclude journal entries, profile details, and morning reflections.
          </Text>
        </View>

        <View style={styles.sectionHeadingRow}>
          <Text style={styles.sectionHeading}>Recent sessions</Text>
          <Text style={styles.count}>{memory.sessions.length}</Text>
        </View>

        {loading ? (
          <Text style={styles.emptyText}>Loading playback records…</Text>
        ) : memory.sessions.length === 0 ? (
          <Text style={styles.emptyText}>No journey playback has been recorded on this device yet.</Text>
        ) : (
          memory.sessions.slice(0, 20).map(session => {
            const active = session.id === selectedId;
            return (
              <Pressable
                key={session.id}
                onPress={() => setSelectedId(session.id)}
                accessibilityRole="button"
                style={[styles.sessionCard, active && styles.sessionCardActive]}
              >
                <View style={styles.sessionTopRow}>
                  <Text style={styles.sessionTitle} numberOfLines={1}>{session.title || session.journeyId}</Text>
                  <Text style={[styles.outcome, session.outcome === 'failed' && styles.failed]}>{outcomeLabel(session)}</Text>
                </View>
                <Text style={styles.sessionMeta}>
                  {new Date(session.startedAt).toLocaleString()} · listened {formatDuration(session.actualDurationMs)}
                </Text>
              </Pressable>
            );
          })
        )}

        {selected && (
          <View style={styles.detailCard}>
            <Text style={styles.sectionHeading}>Session details</Text>
            <View style={styles.metricGrid}>
              <View style={styles.metric}><Text style={styles.metricLabel}>Planned</Text><Text style={styles.metricValue}>{formatDuration(selected.plannedDurationMs)}</Text></View>
              <View style={styles.metric}><Text style={styles.metricLabel}>Listened</Text><Text style={styles.metricValue}>{formatDuration(selected.actualDurationMs)}</Text></View>
              <View style={styles.metric}><Text style={styles.metricLabel}>Wall time</Text><Text style={styles.metricValue}>{formatDuration(selected.elapsedWallTimeMs)}</Text></View>
              <View style={styles.metric}><Text style={styles.metricLabel}>Events</Text><Text style={styles.metricValue}>{selected.events.length}</Text></View>
            </View>
            <Text style={styles.identifiers}>Journey: {selected.journeyId}</Text>
            <Text style={styles.identifiers}>Protocol {selected.protocolVersion} · seed {selected.seed}</Text>

            <Text style={[styles.sectionHeading, styles.timelineHeading]}>Event timeline</Text>
            {selected.events.length === 0 ? (
              <Text style={styles.emptyText}>No events recorded.</Text>
            ) : selected.events.map((event, index) => (
              <View key={`${event.at}-${event.type}-${index}`} style={styles.eventRow}>
                <Text style={styles.eventTime}>{formatTime(event.positionMs)}</Text>
                <View style={styles.eventMarker} />
                <View style={styles.eventCopy}>
                  <Text style={styles.eventTitle}>{describeEvent(event)}</Text>
                  <Text style={styles.eventMeta}>{new Date(event.at).toLocaleTimeString()}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <Pressable
          onPress={exportDiagnostics}
          disabled={exporting || memory.sessions.length === 0}
          accessibilityRole="button"
          style={[styles.exportButton, (exporting || memory.sessions.length === 0) && styles.disabled]}
        >
          <Text style={styles.exportText}>{exporting ? 'Creating report…' : 'Export playback report'}</Text>
        </Pressable>
        <Text style={styles.exportNote}>Use this report when investigating a playback issue. Nothing is sent automatically.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0D0B18' },
  header: { position: 'absolute', left: 0, right: 0, top: 0, zIndex: 3, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(13,11,24,0.94)' },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerButtonText: { color: '#F4EFFB', fontSize: 38, fontWeight: '200', lineHeight: 40 },
  headerCopy: { flex: 1, alignItems: 'center' },
  title: { color: '#F4EFFB', fontSize: 20, fontFamily: 'CalSans-SemiBold' },
  subtitle: { color: 'rgba(244,239,251,0.58)', fontSize: 11, marginTop: 2 },
  refreshButton: { width: 52, height: 44, alignItems: 'flex-end', justifyContent: 'center' },
  refreshText: { color: '#D5B16A', fontSize: 12 },
  content: { padding: 18, gap: 12 },
  privacyCard: { padding: 15, borderRadius: 12, backgroundColor: 'rgba(129,104,177,0.12)', borderWidth: 1, borderColor: 'rgba(173,143,220,0.22)' },
  privacyTitle: { color: '#E9DEF7', fontSize: 14, fontFamily: 'CalSans-SemiBold', marginBottom: 5 },
  privacyText: { color: 'rgba(238,229,248,0.72)', fontSize: 12, lineHeight: 18 },
  sectionHeadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  sectionHeading: { color: '#F0E9F7', fontSize: 15, fontFamily: 'CalSans-SemiBold' },
  count: { color: 'rgba(240,233,247,0.52)', fontSize: 12 },
  emptyText: { color: 'rgba(240,233,247,0.55)', fontSize: 13, lineHeight: 19, paddingVertical: 8 },
  sessionCard: { padding: 13, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.045)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  sessionCardActive: { borderColor: 'rgba(213,177,106,0.65)', backgroundColor: 'rgba(213,177,106,0.08)' },
  sessionTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sessionTitle: { flex: 1, color: '#F0E9F7', fontSize: 14 },
  outcome: { color: '#B9D7BD', fontSize: 11 },
  failed: { color: '#E6A5A5' },
  sessionMeta: { color: 'rgba(240,233,247,0.52)', fontSize: 11, marginTop: 5 },
  detailCard: { marginTop: 6, padding: 15, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.035)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginTop: 10, marginBottom: 8 },
  metric: { width: '50%', padding: 4 },
  metricLabel: { color: 'rgba(240,233,247,0.50)', fontSize: 11 },
  metricValue: { color: '#F0E9F7', fontSize: 15, marginTop: 2 },
  identifiers: { color: 'rgba(240,233,247,0.58)', fontSize: 11, lineHeight: 17 },
  timelineHeading: { marginTop: 18, marginBottom: 8 },
  eventRow: { flexDirection: 'row', alignItems: 'flex-start', minHeight: 45 },
  eventTime: { width: 52, color: '#D5B16A', fontSize: 11, paddingTop: 2 },
  eventMarker: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#9C82C7', marginTop: 5, marginRight: 10 },
  eventCopy: { flex: 1, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.07)' },
  eventTitle: { color: 'rgba(244,239,251,0.88)', fontSize: 12, lineHeight: 17 },
  eventMeta: { color: 'rgba(244,239,251,0.38)', fontSize: 10, marginTop: 2 },
  exportButton: { marginTop: 6, paddingVertical: 14, borderRadius: 9, alignItems: 'center', backgroundColor: 'rgba(180,140,80,0.20)', borderWidth: 1, borderColor: 'rgba(213,177,106,0.68)' },
  exportText: { color: '#E6C680', fontSize: 14, fontFamily: 'CalSans-SemiBold' },
  exportNote: { color: 'rgba(240,233,247,0.48)', fontSize: 11, lineHeight: 17, textAlign: 'center' },
  disabled: { opacity: 0.4 },
});
