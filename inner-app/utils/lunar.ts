export type MoonPhase =
  | 'new'|'waxing-crescent'|'first-quarter'|'waxing-gibbous'
  | 'full'|'waning-gibbous'|'last-quarter'|'waning-crescent';

export function moonPhaseFor(d = new Date()): MoonPhase {
  const synodic = 29.530588853;              // days
  const epoch = Date.UTC(2000, 0, 6, 18, 14); // known new moon
  const days = (d.getTime() - epoch) / 86400000;
  const cycle = ((days % synodic) + synodic) % synodic;
  const p = cycle / synodic;
  if (p < 0.03 || p > 0.97) return 'new';
  if (p < 0.22) return 'waxing-crescent';
  if (p < 0.28) return 'first-quarter';
  if (p < 0.47) return 'waxing-gibbous';
  if (p < 0.53) return 'full';
  if (p < 0.72) return 'waning-gibbous';
  if (p < 0.78) return 'last-quarter';
  return 'waning-crescent';
}