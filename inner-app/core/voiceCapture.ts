export function appendVoiceTranscript(base: string, transcript: string, maxLength?: number) {
  const prefix = base.trimEnd();
  const spoken = transcript.trim();
  const combined = prefix && spoken ? `${prefix} ${spoken}` : prefix || spoken;
  return typeof maxLength === 'number' ? combined.slice(0, maxLength) : combined;
}

export function appendFinalVoiceSegment(segments: string[], transcript: string) {
  const spoken = transcript.trim();
  if (!spoken || segments[segments.length - 1] === spoken) return segments;
  return [...segments, spoken];
}

export function composeVoiceTranscript(
  base: string,
  finalSegments: string[],
  interimSegment = '',
  maxLength?: number,
) {
  const spoken = [...finalSegments, interimSegment]
    .map(segment => segment.trim())
    .filter(Boolean)
    .join(' ');
  return appendVoiceTranscript(base, spoken, maxLength);
}
