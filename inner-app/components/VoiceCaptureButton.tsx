import { Ionicons } from '@expo/vector-icons';
import { getLocales } from 'expo-localization';
import {
  ExpoSpeechRecognitionModule,
  TaskHintIOS,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { appendVoiceTranscript } from '../core/voiceCapture';

export type VoiceRecognitionMode = 'on_device' | 'platform_service';

type Props = {
  value: string;
  onChangeText: (value: string) => void;
  onBeforeStart?: () => string;
  onVoiceUsed?: (mode: VoiceRecognitionMode) => void;
  disabled?: boolean;
  maxLength?: number;
  compact?: boolean;
};

function recognitionErrorMessage(code: string) {
  if (code === 'no-speech') return 'Nothing heard. Tap the microphone to try again.';
  if (code === 'not-allowed' || code === 'service-not-allowed') {
    return 'Microphone or speech recognition access is turned off.';
  }
  if (code === 'language-not-supported') return 'Voice capture is not available for this language yet.';
  if (code === 'network') return 'The device speech service is unavailable right now.';
  return 'Voice capture stopped. Your words are still here.';
}

export default function VoiceCaptureButton({
  value,
  onChangeText,
  onBeforeStart,
  onVoiceUsed,
  disabled = false,
  maxLength,
  compact = false,
}: Props) {
  const [listening, setListening] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeRef = useRef(false);
  const baseTextRef = useRef('');
  const modeRef = useRef<VoiceRecognitionMode>('platform_service');
  const voiceReportedRef = useRef(false);
  const onChangeRef = useRef(onChangeText);
  const onVoiceUsedRef = useRef(onVoiceUsed);
  onChangeRef.current = onChangeText;
  onVoiceUsedRef.current = onVoiceUsed;

  useSpeechRecognitionEvent('start', () => {
    if (!activeRef.current) return;
    setStarting(false);
    setListening(true);
  });

  useSpeechRecognitionEvent('result', event => {
    if (!activeRef.current) return;
    const transcript = event.results[0]?.transcript?.trim();
    if (!transcript) return;
    onChangeRef.current(appendVoiceTranscript(baseTextRef.current, transcript, maxLength));
    if (!voiceReportedRef.current) {
      voiceReportedRef.current = true;
      onVoiceUsedRef.current?.(modeRef.current);
    }
  });

  useSpeechRecognitionEvent('error', event => {
    if (!activeRef.current || event.error === 'aborted') return;
    setError(recognitionErrorMessage(event.error));
  });

  useSpeechRecognitionEvent('end', () => {
    if (!activeRef.current) return;
    if (!voiceReportedRef.current) {
      setError(current => current ?? 'Nothing heard. Tap the microphone to try again.');
    }
    activeRef.current = false;
    setStarting(false);
    setListening(false);
  });

  useEffect(() => () => {
    if (!activeRef.current) return;
    activeRef.current = false;
    try { ExpoSpeechRecognitionModule.abort(); } catch {}
  }, []);

  const start = useCallback(async () => {
    if (disabled || starting || listening) return;
    setError(null);
    setStarting(true);
    try {
      if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
        setError('Voice capture is not available on this device.');
        setStarting(false);
        return;
      }

      const onDevice = ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
      const permission = onDevice
        ? await ExpoSpeechRecognitionModule.requestMicrophonePermissionsAsync()
        : await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        setError('Allow microphone and speech recognition access to speak your dream.');
        setStarting(false);
        return;
      }

      baseTextRef.current = onBeforeStart ? onBeforeStart() : value;
      modeRef.current = onDevice ? 'on_device' : 'platform_service';
      voiceReportedRef.current = false;
      activeRef.current = true;
      const locale = getLocales()[0]?.languageTag || 'en-US';
      ExpoSpeechRecognitionModule.start({
        lang: locale,
        interimResults: true,
        continuous: false,
        addsPunctuation: true,
        requiresOnDeviceRecognition: onDevice,
        iosTaskHint: TaskHintIOS.dictation,
      });
    } catch {
      activeRef.current = false;
      setStarting(false);
      setListening(false);
      setError('Voice capture could not start. Your words are still here.');
    }
  }, [disabled, listening, onBeforeStart, starting, value]);

  const stop = useCallback(() => {
    if (!activeRef.current) return;
    setListening(false);
    try { ExpoSpeechRecognitionModule.stop(); } catch {
      activeRef.current = false;
    }
  }, []);

  const active = listening || starting;
  return (
    <View style={[styles.root, compact && styles.rootCompact]}>
      <Pressable
        onPress={active ? stop : start}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={active ? 'Stop voice capture' : 'Speak your dream'}
        accessibilityHint={active ? 'Stops listening and keeps the transcription' : 'Transcribes your voice into this entry'}
        accessibilityState={{ disabled, busy: starting }}
        style={({ pressed }) => [
          styles.button,
          compact && styles.buttonCompact,
          active && styles.buttonActive,
          disabled && styles.disabled,
          pressed && styles.pressed,
        ]}
      >
        <View style={[styles.mic, active && styles.micActive]}>
          <Ionicons name={active ? 'stop' : 'mic'} size={compact ? 15 : 17} color={active ? '#FFF8FF' : '#DDD1F5'} />
        </View>
        <View>
          <Text style={styles.label}>{starting ? 'STARTING…' : listening ? 'LISTENING…' : 'SPEAK'}</Text>
          {!compact && (
            <Text style={styles.hint}>{listening ? 'Tap when you are finished' : 'Your voice becomes editable text'}</Text>
          )}
        </View>
      </Pressable>
      {!!error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignSelf: 'stretch', marginTop: 10 },
  rootCompact: { alignSelf: 'flex-start', marginTop: 6 },
  button: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(205,194,255,0.28)',
    backgroundColor: 'rgba(86,68,132,0.16)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonCompact: { minHeight: 40, paddingHorizontal: 12 },
  buttonActive: { borderColor: 'rgba(219,199,255,0.72)', backgroundColor: 'rgba(126,91,183,0.34)' },
  mic: {
    width: 30,
    height: 30,
    marginRight: 10,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(205,194,255,0.12)',
  },
  micActive: { backgroundColor: 'rgba(205,170,255,0.34)' },
  label: { color: '#E4DCF5', fontFamily: 'Inter-Medium', fontSize: 9, letterSpacing: 1.25 },
  hint: { color: '#9D94AA', fontFamily: 'Inter-ExtraLight', fontSize: 9, marginTop: 2 },
  error: { color: '#C8BFD2', fontFamily: 'Inter-Light', fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 6 },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.76 },
});
