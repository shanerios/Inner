export function appendVoiceTranscript(base: string, transcript: string, maxLength?: number) {
  const prefix = base.trimEnd();
  const spoken = transcript.trim();
  const combined = prefix && spoken ? `${prefix} ${spoken}` : prefix || spoken;
  return typeof maxLength === 'number' ? combined.slice(0, maxLength) : combined;
}
