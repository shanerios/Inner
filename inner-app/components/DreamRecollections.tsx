// components/DreamRecollections.tsx
// Provenance label, dated additions, and history for a journal entry.
import React, { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import VoiceCaptureButton from './VoiceCaptureButton';
import { Typography } from '../core/typography';
import { addAddition, deleteAddition, editAddition, type JournalEntry } from '../core/journalRepo';
import {
  MAX_RECOLLECTION_LENGTH,
  additionHeading,
  baselineHeading,
  bodyDiffersFromBaseline,
  buildDreamTimeline,
  type DreamAddition,
  type DreamAdditionKind,
  type DreamBaseline,
} from '../core/dreamRecollections';

export function formatStamp(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

// ── Label above the editable account ────────────────────────────────────────

type BaselineLabelProps = {
  baseline?: DreamBaseline;
  body: string;
  onViewOriginal: () => void;
};

/**
 * Says what the text below is. Revised text is never labelled as the original;
 * the preserved version is one tap away.
 */
export function BaselineLabel({ baseline, body, onViewOriginal }: BaselineLabelProps) {
  if (!baseline) return null;
  const differs = bodyDiffersFromBaseline(baseline, body);
  if (!differs) {
    return (
      <Text style={styles.provenance} accessibilityLabel={`${baselineHeading(baseline)}, ${formatStamp(baseline.capturedAt)}`}>
        {baselineHeading(baseline).toUpperCase()} · {formatStamp(baseline.capturedAt)}
      </Text>
    );
  }
  return (
    <View style={styles.labelRow}>
      <Text style={styles.provenance}>CURRENT ACCOUNT · EDITED SINCE</Text>
      <Pressable
        onPress={onViewOriginal}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={baseline.source === 'original' ? 'View original recollection' : 'View first saved version'}
      >
        <Text style={styles.link}>{baseline.source === 'original' ? 'View original' : 'View first saved'}</Text>
      </Pressable>
    </View>
  );
}

// ── Dated additions + "Return to this dream" ─────────────────────────────────

type PanelProps = {
  entry: JournalEntry;
  noun: 'dream' | 'entry';
  onChanged: (entry: JournalEntry) => void;
  onViewHistory: () => void;
};

export default function DreamRecollectionPanel({ entry, noun, onChanged, onViewHistory }: PanelProps) {
  const [open, setOpen] = useState(false);
  const [composer, setComposer] = useState<DreamAdditionKind | null>(null);
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Nothing to add to until the original has been preserved.
  if (!entry.baseline) return null;

  const additions = [...(entry.additions ?? [])].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));

  const run = async (task: () => Promise<JournalEntry>, done: () => void) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      onChanged(await task());
      done();
    } catch {
      setError('Could not save just now. Your words are still here.');
    } finally {
      setBusy(false);
    }
  };

  const startComposer = (kind: DreamAdditionKind) => {
    Haptics.selectionAsync().catch(() => {});
    setComposer(kind);
    setDraft('');
    setError(null);
  };

  const closeComposer = () => {
    setComposer(null);
    setDraft('');
    setOpen(false);
  };

  const submit = () => {
    if (!composer || !draft.trim()) return;
    const kind = composer;
    void run(async () => (await addAddition(entry.id, { kind, text: draft })).entry, closeComposer);
  };

  const saveEdit = () => {
    if (!editingId || !editDraft.trim()) return;
    const id = editingId;
    void run(() => editAddition(entry.id, id, editDraft), () => {
      setEditingId(null);
      setEditDraft('');
    });
  };

  const confirmDelete = (addition: DreamAddition) => {
    const label = addition.kind === 'reflection' ? 'reflection' : 'remembered detail';
    Alert.alert(`Delete this ${label}?`, 'This cannot be undone. The original recollection is not affected.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => { void run(() => deleteAddition(entry.id, addition.id), () => {}); },
      },
    ]);
  };

  const composerTitle = composer === 'reflection' ? 'Add a reflection' : 'Add a remembered detail';
  const composerPlaceholder = composer === 'reflection'
    ? 'What does this bring to mind?'
    : 'What else do you remember?';

  return (
    <View style={styles.panel}>
      {additions.map((addition) => {
        const isEditing = editingId === addition.id;
        return (
          <View key={addition.id} style={styles.card}>
            <Text style={styles.cardHeading}>
              {additionHeading(addition.kind).toUpperCase()} · {formatStamp(addition.createdAt)}
              {addition.editedAt ? ' · EDITED' : ''}
            </Text>
            {isEditing ? (
              <>
                <TextInput
                  value={editDraft}
                  onChangeText={setEditDraft}
                  multiline
                  maxLength={MAX_RECOLLECTION_LENGTH}
                  style={styles.input}
                  accessibilityLabel={`Edit ${additionHeading(addition.kind).toLowerCase()}`}
                  textAlignVertical="top"
                  autoFocus
                />
                <View style={styles.actionRow}>
                  <Pressable onPress={saveEdit} disabled={busy || !editDraft.trim()} accessibilityRole="button">
                    <Text style={[styles.link, (busy || !editDraft.trim()) && styles.disabled]}>Save</Text>
                  </Pressable>
                  <Pressable onPress={() => { setEditingId(null); setEditDraft(''); }} accessibilityRole="button">
                    <Text style={styles.muted}>Cancel</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.cardText} selectable>{addition.text}</Text>
                <View style={styles.actionRow}>
                  <Pressable
                    onPress={() => { setEditingId(addition.id); setEditDraft(addition.text); setError(null); }}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${additionHeading(addition.kind).toLowerCase()}`}
                  >
                    <Text style={styles.muted}>Edit</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => confirmDelete(addition)}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${additionHeading(addition.kind).toLowerCase()}`}
                  >
                    <Text style={styles.muted}>Delete</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        );
      })}

      {composer ? (
        <View style={styles.card}>
          <Text style={styles.cardHeading}>{composerTitle.toUpperCase()}</Text>
          <VoiceCaptureButton
            value={draft}
            onChangeText={setDraft}
            maxLength={MAX_RECOLLECTION_LENGTH}
            compact
          />
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={composerPlaceholder}
            placeholderTextColor="rgba(237,234,246,0.35)"
            multiline
            maxLength={MAX_RECOLLECTION_LENGTH}
            style={styles.input}
            accessibilityLabel={composerTitle}
            textAlignVertical="top"
            autoFocus
          />
          <View style={styles.actionRow}>
            <Pressable onPress={submit} disabled={busy || !draft.trim()} accessibilityRole="button" accessibilityLabel="Save">
              <Text style={[styles.link, (busy || !draft.trim()) && styles.disabled]}>Save</Text>
            </Pressable>
            <Pressable onPress={closeComposer} accessibilityRole="button" accessibilityLabel="Cancel">
              <Text style={styles.muted}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.returnWrap}>
          <Pressable
            onPress={() => { Haptics.selectionAsync().catch(() => {}); setOpen(value => !value); }}
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            accessibilityLabel={`Return to this ${noun}`}
            style={styles.returnButton}
          >
            <Text style={styles.returnLabel}>Return to this {noun}</Text>
          </Pressable>
          {open && (
            <View style={styles.optionRow}>
              <Pressable onPress={() => startComposer('recollection')} accessibilityRole="button">
                <Text style={styles.option}>Add a remembered detail</Text>
              </Pressable>
              <Pressable onPress={() => startComposer('reflection')} accessibilityRole="button">
                <Text style={styles.option}>Add a reflection</Text>
              </Pressable>
              <Pressable onPress={() => { setOpen(false); onViewHistory(); }} accessibilityRole="button">
                <Text style={styles.option}>View history</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}

      {!!error && <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text>}
    </View>
  );
}

// ── History ──────────────────────────────────────────────────────────────────

type HistoryProps = {
  visible: boolean;
  entry: JournalEntry | null;
  body: string;
  onClose: () => void;
};

export function DreamHistoryModal({ visible, entry, body, onClose }: HistoryProps) {
  const baseline = entry?.baseline;
  const timeline = entry ? buildDreamTimeline(baseline, entry.additions) : [];
  const edited = bodyDiffersFromBaseline(baseline, body);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>History</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close history">
              <Text style={styles.link}>Close</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
            {timeline.map((item) => (
              <View key={item.id} style={styles.historyItem}>
                <Text style={styles.cardHeading}>
                  {item.heading.toUpperCase()} · {formatStamp(item.timestamp)}{item.edited ? ' · EDITED' : ''}
                </Text>
                {item.kind === 'baseline' && baseline?.source === 'legacy_snapshot' && (
                  <Text style={styles.note}>
                    Preserved {formatStamp(baseline.preservedAt)}. This is the text as it stood then, and it may have
                    been edited before it was preserved.
                  </Text>
                )}
                {item.kind === 'baseline' && edited && (
                  <Text style={styles.note}>The account on the main page has been edited since.</Text>
                )}
                <Text style={styles.cardText} selectable>{item.text}</Text>
              </View>
            ))}
            {timeline.length === 0 && <Text style={styles.note}>Nothing has been preserved yet.</Text>}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  provenance: {
    color: '#A99BC8',
    fontFamily: 'Inter-Medium',
    fontSize: 8,
    letterSpacing: 1.35,
    marginBottom: 6,
  },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  link: { ...Typography.caption, color: '#8E88D8' },
  muted: { ...Typography.caption, color: '#B9B2D6', opacity: 0.8 },
  disabled: { opacity: 0.4 },
  panel: { marginTop: 18, marginBottom: 18 },
  card: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.11)',
    paddingTop: 14,
    paddingBottom: 6,
    marginBottom: 10,
  },
  cardHeading: {
    color: '#A99BC8',
    fontFamily: 'Inter-Medium',
    fontSize: 8,
    letterSpacing: 1.35,
    marginBottom: 6,
  },
  cardText: { ...Typography.body, color: '#EDEAF6' },
  input: {
    ...Typography.body,
    color: '#EDEAF6',
    minHeight: 96,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: 10,
    padding: 10,
    marginTop: 6,
  },
  actionRow: { flexDirection: 'row', gap: 22, marginTop: 10 },
  returnWrap: { marginTop: 6 },
  returnButton: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(207,195,224,0.35)',
    backgroundColor: 'rgba(207,195,224,0.08)',
  },
  returnLabel: { ...Typography.caption, color: '#E6E0F4' },
  optionRow: { marginTop: 8, gap: 4 },
  option: { ...Typography.caption, color: '#CFC9E8', paddingVertical: 8 },
  error: { ...Typography.caption, color: '#EAA', marginTop: 8 },
  note: { ...Typography.caption, color: '#B9B2D6', opacity: 0.8, marginBottom: 8 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(8,8,18,0.82)', justifyContent: 'flex-end' },
  modalSheet: {
    maxHeight: '85%',
    backgroundColor: 'rgba(24,22,40,1)',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { ...Typography.body, color: '#F0EEF8' },
  historyItem: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.11)',
    paddingTop: 12,
    marginBottom: 12,
  },
});
