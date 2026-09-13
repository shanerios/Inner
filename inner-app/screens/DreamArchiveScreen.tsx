import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from '../core/memorySafeVideo';
import {
  buildDreamArchiveExport,
  buildDreamArchiveHtml,
  DREAM_ARCHIVE_RANGE_LABELS,
  DreamArchiveRange,
  filterDreamArchiveEntries,
  serializeDreamArchive,
} from '../core/dreamArchive';
import { JournalEntry, listEntries } from '../core/journalRepo';
import { Typography } from '../core/typography';

const RANGES: DreamArchiveRange[] = ['all', 'year', '30days'];

function archiveFilename(extension: 'pdf' | 'json', generatedAt: number): string {
  const date = new Date(generatedAt).toISOString().slice(0, 10);
  return `inner-dream-archive-${date}.${extension}`;
}

export default function DreamArchiveScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [range, setRange] = useState<DreamArchiveRange>('all');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<'pdf' | 'json' | null>(null);
  const background = useVideoPlayer(require('../assets/videos/dream_journal_bg.mp4'), player => {
    player.loop = true;
    player.muted = true;
    player.audioMixingMode = 'mixWithOthers';
    player.play();
  });

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    void listEntries().then(next => {
      if (active) setEntries(next);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []));

  const selectedEntries = useMemo(
    () => filterDreamArchiveEntries(entries, range),
    [entries, range],
  );

  const sharePdf = useCallback(async () => {
    if (exporting || selectedEntries.length === 0) return;
    setExporting('pdf');
    let sourceUri: string | null = null;
    let archiveUri: string | null = null;
    try {
      if (!await Sharing.isAvailableAsync()) throw new Error('Sharing is unavailable');
      if (!FileSystem.cacheDirectory) throw new Error('Local cache is unavailable');
      const generatedAt = Date.now();
      const archive = buildDreamArchiveExport(selectedEntries, range, generatedAt);
      const result = await Print.printToFileAsync({ html: buildDreamArchiveHtml(archive) });
      sourceUri = result.uri;
      archiveUri = `${FileSystem.cacheDirectory}${archiveFilename('pdf', generatedAt)}`;
      await FileSystem.copyAsync({ from: sourceUri, to: archiveUri });
      await Sharing.shareAsync(archiveUri, {
        mimeType: 'application/pdf',
        UTI: 'com.adobe.pdf',
        dialogTitle: 'Save Dream Archive PDF',
      });
    } catch {
      Alert.alert('Could not create archive', 'Inner could not create the PDF. Please try again.');
    } finally {
      if (archiveUri) await FileSystem.deleteAsync(archiveUri, { idempotent: true }).catch(() => {});
      if (sourceUri) await FileSystem.deleteAsync(sourceUri, { idempotent: true }).catch(() => {});
      setExporting(null);
    }
  }, [exporting, range, selectedEntries]);

  const shareJson = useCallback(async () => {
    if (exporting || selectedEntries.length === 0) return;
    setExporting('json');
    let uri: string | null = null;
    try {
      if (!await Sharing.isAvailableAsync()) throw new Error('Sharing is unavailable');
      if (!FileSystem.cacheDirectory) throw new Error('Local cache is unavailable');
      const generatedAt = Date.now();
      const archive = buildDreamArchiveExport(selectedEntries, range, generatedAt);
      uri = `${FileSystem.cacheDirectory}${archiveFilename('json', generatedAt)}`;
      await FileSystem.writeAsStringAsync(uri, serializeDreamArchive(archive), {
        encoding: FileSystem.EncodingType.UTF8,
      });
      await Sharing.shareAsync(uri, {
        mimeType: 'application/json',
        UTI: 'public.json',
        dialogTitle: 'Save Dream Archive JSON',
      });
    } catch {
      Alert.alert('Could not create archive', 'Inner could not create the JSON archive. Please try again.');
    } finally {
      if (uri) void FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
      setExporting(null);
    }
  }, [exporting, range, selectedEntries]);

  const countLabel = loading
    ? 'Gathering your memories…'
    : `${selectedEntries.length} ${selectedEntries.length === 1 ? 'entry' : 'entries'} ready to carry with you.`;

  return (
    <View style={styles.root}>
      <VideoView player={background} contentFit="cover" style={StyleSheet.absoluteFill} nativeControls={false} allowsFullscreen={false} allowsPictureInPicture={false} />
      <View style={styles.veil} pointerEvents="none" />
      <View pointerEvents="none" style={[styles.fixedHeader, { top: insets.top + 22 }]}>
        <Text style={[Typography.display, styles.title]}>Dream Archive</Text>
        <Text style={[Typography.body, styles.subtitle]}>Your memories belong to you.</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 132, paddingBottom: insets.bottom + 36 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.eyebrow}>CHOOSE A RANGE</Text>
          <View style={styles.rangeRow}>
            {RANGES.map(value => {
              const selected = range === value;
              return (
                <Pressable
                  key={value}
                  onPress={() => setRange(value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={[styles.rangeButton, selected && styles.rangeButtonSelected]}
                >
                  <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={[styles.rangeText, selected && styles.rangeTextSelected]}>
                    {DREAM_ARCHIVE_RANGE_LABELS[value]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.count}>{countLabel}</Text>
        </View>

        <View style={styles.formatCard}>
          <Text style={styles.formatTitle}>A readable archive</Text>
          <Text style={styles.formatCopy}>PDF preserves each entry with its date, writing, dream signs, intentions, and available context in a quiet document made for reading or printing.</Text>
          <Pressable
            onPress={() => void sharePdf()}
            disabled={loading || selectedEntries.length === 0 || exporting !== null}
            accessibilityRole="button"
            style={[styles.primaryButton, (loading || selectedEntries.length === 0 || exporting !== null) && styles.buttonDisabled]}
          >
            <Text style={styles.primaryButtonText}>{exporting === 'pdf' ? 'CREATING PDF…' : 'CREATE PDF ARCHIVE'}</Text>
          </Pressable>
        </View>

        <View style={styles.formatCard}>
          <Text style={styles.formatTitle}>A portable copy</Text>
          <Text style={styles.formatCopy}>JSON preserves the complete structured entries in a versioned file for backup, migration, or future tools.</Text>
          <Pressable
            onPress={() => void shareJson()}
            disabled={loading || selectedEntries.length === 0 || exporting !== null}
            accessibilityRole="button"
            style={[styles.secondaryButton, (loading || selectedEntries.length === 0 || exporting !== null) && styles.buttonDisabled]}
          >
            <Text style={styles.secondaryButtonText}>{exporting === 'json' ? 'CREATING JSON…' : 'CREATE JSON ARCHIVE'}</Text>
          </Pressable>
        </View>

        <Text style={styles.privacy}>Archive files are created on this device and opened in your device’s share sheet. Inner does not upload their contents.</Text>
        <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" style={styles.returnButton}>
          <Text style={styles.returnText}>RETURN</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#05040A' },
  veil: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(3,2,8,0.70)' },
  fixedHeader: { position: 'absolute', left: 24, right: 24, zIndex: 3, alignItems: 'center' },
  title: { color: '#F3EFF9', fontSize: 24, textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.9)', textShadowRadius: 12 },
  subtitle: { color: '#CFC7D9', fontFamily: 'Inter-ExtraLight', fontSize: 13, marginTop: 7, textAlign: 'center' },
  content: { paddingHorizontal: 22 },
  card: { padding: 18, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(205,194,255,0.20)', backgroundColor: 'rgba(8,7,17,0.78)' },
  eyebrow: { color: '#AFA4D5', fontFamily: 'Inter-Medium', fontSize: 8, letterSpacing: 1.5, textAlign: 'center' },
  rangeRow: { flexDirection: 'row', gap: 7, marginTop: 14 },
  rangeButton: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7, borderRadius: 19, borderWidth: 1, borderColor: 'rgba(205,194,255,0.17)' },
  rangeButtonSelected: { borderColor: 'rgba(205,194,255,0.60)', backgroundColor: 'rgba(105,83,171,0.34)' },
  rangeText: { color: '#AAA2B5', fontFamily: 'Inter-Medium', fontSize: 9, textAlign: 'center' },
  rangeTextSelected: { color: '#F0EAFB' },
  count: { color: '#A9A1B5', fontFamily: 'Inter-ExtraLight', fontSize: 11, textAlign: 'center', marginTop: 14 },
  formatCard: { marginTop: 15, padding: 18, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(205,194,255,0.16)', backgroundColor: 'rgba(8,7,17,0.72)' },
  formatTitle: { color: '#EEEAF5', fontFamily: 'CalSans-SemiBold', fontSize: 17 },
  formatCopy: { color: '#B9B1C4', fontFamily: 'Inter-ExtraLight', fontSize: 11, lineHeight: 17, marginTop: 7 },
  primaryButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', marginTop: 17, paddingHorizontal: 14, borderRadius: 23, borderWidth: 1, borderColor: 'rgba(210,198,255,0.52)', backgroundColor: 'rgba(169,149,245,0.20)' },
  primaryButtonText: { color: '#F2EDFA', fontFamily: 'Inter-Medium', fontSize: 9, letterSpacing: 1.5 },
  secondaryButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', marginTop: 15, paddingHorizontal: 14, borderRadius: 21, borderWidth: 1, borderColor: 'rgba(205,194,255,0.25)' },
  secondaryButtonText: { color: '#D8D0E5', fontFamily: 'Inter-Medium', fontSize: 9, letterSpacing: 1.4 },
  buttonDisabled: { opacity: 0.42 },
  privacy: { color: '#8E8798', fontFamily: 'Inter-ExtraLight', fontSize: 9, lineHeight: 14, textAlign: 'center', marginTop: 18, paddingHorizontal: 12 },
  returnButton: { alignSelf: 'center', paddingHorizontal: 24, paddingVertical: 14, marginTop: 10 },
  returnText: { color: '#E8E2F2', fontFamily: 'Inter-Medium', fontSize: 10, letterSpacing: 2.1 },
});
