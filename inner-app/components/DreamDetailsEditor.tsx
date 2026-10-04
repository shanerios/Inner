import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  CONTROL_DOMAIN_OPTIONS,
  DreamAgency,
  DreamAwareness,
  DreamControlDomain,
  DreamControlResult,
  DreamDetails,
  INNER_CUE_OPTIONS,
  InnerCueType,
  dreamDetailsSummary,
  normalizeDreamDetails,
} from '../core/dreamDetails';
import { Typography } from '../core/typography';

type Props = {
  value?: DreamDetails;
  onChange: (value: DreamDetails | undefined) => void;
  initiallyExpanded?: boolean;
};

type Choice<T extends string> = { value: T; label: string };

const AWARENESS_OPTIONS: Choice<DreamAwareness>[] = [
  { value: 'no', label: 'No' },
  { value: 'maybe', label: 'Maybe' },
  { value: 'yes', label: 'Yes' },
];

const AGENCY_OPTIONS: Choice<DreamAgency>[] = [
  { value: 'no', label: 'No' },
  { value: 'a_little', label: 'A little' },
  { value: 'yes', label: 'Yes' },
];

const CONTROL_RESULT_OPTIONS: Choice<DreamControlResult>[] = [
  { value: 'did_not_work', label: 'Did not work' },
  { value: 'partly_worked', label: 'Partly worked' },
  { value: 'worked', label: 'Worked' },
];

function ChoiceRow<T extends string>({
  options,
  selected,
  onSelect,
}: {
  options: ReadonlyArray<Choice<T>>;
  selected?: T;
  onSelect: (value: T) => void;
}) {
  return (
    <View style={styles.choices}>
      {options.map(option => {
        const active = selected === option.value;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            key={option.value}
            onPress={() => onSelect(option.value)}
            style={[styles.choice, active && styles.choiceSelected]}
          >
            <Text style={[styles.choiceLabel, active && styles.choiceLabelSelected]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function MultiChoice<T extends string>({
  options,
  selected,
  onToggle,
}: {
  options: ReadonlyArray<Choice<T>>;
  selected?: T[];
  onToggle: (value: T) => void;
}) {
  return (
    <View style={styles.choices}>
      {options.map(option => {
        const active = selected?.includes(option.value) ?? false;
        return (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: active }}
            key={option.value}
            onPress={() => onToggle(option.value)}
            style={[styles.choice, active && styles.choiceSelected]}
          >
            <Text style={[styles.choiceLabel, active && styles.choiceLabelSelected]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function DreamDetailsEditor({ value, onChange, initiallyExpanded = false }: Props) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const summary = useMemo(() => dreamDetailsSummary(value), [value]);
  const answered = [value?.awareness, value?.agency, value?.control?.attempted, value?.innerCue?.status]
    .filter(Boolean).length;

  const commit = (next: DreamDetails) => onChange(normalizeDreamDetails(next));

  const toggleDomain = (domain: DreamControlDomain) => {
    const current = value?.control?.domains ?? [];
    const domains = current.includes(domain)
      ? current.filter(item => item !== domain)
      : [...current, domain];
    commit({
      ...value,
      control: { ...value?.control, attempted: 'yes', domains },
    });
  };

  const toggleCue = (cue: InnerCueType) => {
    const current = value?.innerCue?.types ?? [];
    const types = current.includes(cue)
      ? current.filter(item => item !== cue)
      : [...current, cue];
    commit({ ...value, innerCue: { status: 'recognized', types } });
  };

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded(current => !current)}
        style={styles.header}
      >
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>DREAM DETAILS</Text>
          <Text style={styles.headerTitle}>{answered ? `${answered} of 4 reflections` : 'Reflect a little further'}</Text>
        </View>
        <Text style={styles.expandLabel}>{expanded ? 'Close' : 'Open'}</Text>
      </Pressable>

      {!expanded && summary.length > 0 && (
        <View style={styles.summary}>
          {summary.map(line => <Text key={line} style={styles.summaryLine}>{line}</Text>)}
        </View>
      )}

      {expanded && (
        <View style={styles.questions}>
          <View style={styles.question}>
            <Text style={styles.questionTitle}>Did you realize you were dreaming?</Text>
            <Text style={styles.questionHint}>Lucid awareness</Text>
            <ChoiceRow
              options={AWARENESS_OPTIONS}
              selected={value?.awareness}
              onSelect={awareness => commit({ ...value, awareness })}
            />
          </View>

          <View style={styles.question}>
            <Text style={styles.questionTitle}>Did you intentionally choose what to do?</Text>
            <Text style={styles.questionHint}>Agency within the dream</Text>
            <ChoiceRow
              options={AGENCY_OPTIONS}
              selected={value?.agency}
              onSelect={agency => commit({ ...value, agency })}
            />
          </View>

          <View style={styles.question}>
            <Text style={styles.questionTitle}>Did you try to influence or change the dream?</Text>
            <ChoiceRow
              options={[{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }] as const}
              selected={value?.control?.attempted}
              onSelect={attempted => commit({
                ...value,
                control: attempted === 'yes' ? { ...value?.control, attempted } : { attempted },
              })}
            />
          </View>

          {value?.control?.attempted === 'yes' && (
            <>
              <View style={styles.followUp}>
                <Text style={styles.questionTitle}>What did you try to influence?</Text>
                <Text style={styles.questionHint}>Choose all that apply</Text>
                <MultiChoice
                  options={CONTROL_DOMAIN_OPTIONS}
                  selected={value.control.domains}
                  onToggle={toggleDomain}
                />
                {value.control.domains?.includes('other') && (
                  <TextInput
                    accessibilityLabel="Other control domain"
                    value={value.control.otherText ?? ''}
                    onChangeText={otherText => commit({
                      ...value,
                      control: { ...value.control, attempted: 'yes', otherText },
                    })}
                    placeholder="Describe what you tried to influence"
                    placeholderTextColor="rgba(237,234,246,0.35)"
                    style={styles.otherInput}
                  />
                )}
              </View>
              <View style={styles.followUp}>
                <Text style={styles.questionTitle}>How well did it work?</Text>
                <ChoiceRow
                  options={CONTROL_RESULT_OPTIONS}
                  selected={value.control.result}
                  onSelect={result => commit({
                    ...value,
                    control: { ...value.control, attempted: 'yes', result },
                  })}
                />
              </View>
            </>
          )}

          <View style={[styles.question, styles.lastQuestion]}>
            <Text style={styles.questionTitle}>Did anything from Inner appear or influence the dream?</Text>
            <ChoiceRow
              options={[
                { value: 'none', label: 'Nothing noticed' },
                { value: 'unsure', label: 'Not sure' },
                { value: 'recognized', label: 'Yes' },
              ] as const}
              selected={value?.innerCue?.status}
              onSelect={status => commit({
                ...value,
                innerCue: status === 'recognized' ? { ...value?.innerCue, status } : { status },
              })}
            />
          </View>

          {value?.innerCue?.status === 'recognized' && (
            <View style={styles.followUp}>
              <Text style={styles.questionTitle}>What did you recognize?</Text>
              <Text style={styles.questionHint}>Choose all that apply</Text>
              <MultiChoice
                options={INNER_CUE_OPTIONS}
                selected={value.innerCue.types}
                onToggle={toggleCue}
              />
            </View>
          )}

          <Text style={styles.optionalNote}>Everything here is optional. Your answers can be changed later.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderColor: 'rgba(255,255,255,0.10)',
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 22,
    overflow: 'hidden',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  headerCopy: { flex: 1 },
  eyebrow: { ...Typography.caption, color: '#A8A1D9', fontSize: 10, letterSpacing: 1.8 },
  headerTitle: { ...Typography.body, color: '#ECE9F6', marginTop: 3 },
  expandLabel: { ...Typography.caption, color: '#8E88D8', marginLeft: 12 },
  summary: { borderTopColor: 'rgba(255,255,255,0.08)', borderTopWidth: 1, padding: 16, paddingTop: 12 },
  summaryLine: { ...Typography.caption, color: '#CFC9E8', lineHeight: 20 },
  questions: { borderTopColor: 'rgba(255,255,255,0.08)', borderTopWidth: 1, padding: 16 },
  question: { borderBottomColor: 'rgba(255,255,255,0.07)', borderBottomWidth: 1, paddingBottom: 18, marginBottom: 18 },
  lastQuestion: { marginBottom: 0 },
  followUp: { backgroundColor: 'rgba(142,136,216,0.06)', borderRadius: 14, marginBottom: 16, padding: 12 },
  questionTitle: { ...Typography.body, color: '#F0EEF8', lineHeight: 22 },
  questionHint: { ...Typography.caption, color: '#AAA4C2', marginTop: 3, marginBottom: 2 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 11 },
  choice: {
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  choiceSelected: { backgroundColor: 'rgba(142,136,216,0.18)', borderColor: '#8E88D8' },
  choiceLabel: { ...Typography.caption, color: '#D8D3EA' },
  choiceLabelSelected: { color: '#ECE9FF' },
  otherInput: {
    ...Typography.body,
    borderBottomColor: 'rgba(255,255,255,0.14)',
    borderBottomWidth: 1,
    color: '#EDEAF6',
    marginTop: 12,
    paddingBottom: 7,
  },
  optionalNote: { ...Typography.caption, color: '#9D96B5', lineHeight: 18, marginTop: 3 },
});
