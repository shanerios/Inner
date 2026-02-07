import React, { useEffect, useState, useMemo } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Reads aura continuity (written by HomeAuraContinuity) and renders
 * a passive gradient overlay. Format-agnostic:
 *  - JSON { start: '#hex', end: '#hex', opacity? }
 *  - JSON { colors: ['#hex', '#hex', ...], locations?: number[] }
 *  - Plain '#hex' string
 *
 * Falls back to a brand-aligned subtle overlay.
 */

type StoredAura =
  | string
  | {
      start?: string;
      end?: string;
      opacity?: number;
      colors?: string[];
      locations?: number[];
    };

type AuraOverlayProps = {
  /** 0..1 multiplier applied to the computed opacity/alpha (testing knob) */
  strength?: number;
};

const AURA_KEYS = [
  'aura:lastGradient', // prefer richer payloads first
  'aura:last',
  'aura:lastColor',
];

const DEFAULT_COLORS = ['#120E1B', '#0E0A14']; // subtle brand darks
const DEFAULT_LOCATIONS = [0, 1];
const DEFAULT_OPACITY = 0.28; // gentle veil

// add alpha to hex like '#RRGGBB' -> '#RRGGBBAA'
const withAlpha = (hex: string, alpha = 0.28) => {
  try {
    const a = Math.max(0, Math.min(1, alpha));
    const v = Math.round(a * 255);
    const aa = v.toString(16).padStart(2, '0').toUpperCase();
    if (/^#([0-9a-f]{6})$/i.test(hex)) return `${hex}${aa}`;
    if (/^#([0-9a-f]{8})$/i.test(hex)) return hex; // already has alpha
  } catch {}
  return hex;
};

// scale AA channel of a #RRGGBBAA or append AA for #RRGGBB
const scaleAlpha = (hex: string, scale = 1) => {
  const s = Math.max(0, Math.min(1, scale));
  if (/^#([0-9a-f]{8})$/i.test(hex)) {
    const r = hex.slice(1, 3);
    const g = hex.slice(3, 5);
    const b = hex.slice(5, 7);
    const aa = parseInt(hex.slice(7, 9), 16);
    const next = Math.round(aa * s);
    const aaHex = next.toString(16).padStart(2, '0').toUpperCase();
    return `#${r}${g}${b}${aaHex}`;
  }
  if (/^#([0-9a-f]{6})$/i.test(hex)) {
    // apply scale to default opacity
    const aaHex = Math.round(DEFAULT_OPACITY * s * 255).toString(16).padStart(2, '0').toUpperCase();
    return `${hex}${aaHex}`;
  }
  return hex;
};

async function loadStoredAura(): Promise<StoredAura | null> {
  for (const key of AURA_KEYS) {
    try {
      const raw = await AsyncStorage.getItem(key);
      if (!raw) continue;
      // Try JSON first
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed as StoredAura;
      } catch {
        // If it's a plain hex string, return as-is
        if (typeof raw === 'string' && raw.trim().startsWith('#')) {
          return raw.trim();
        }
      }
    } catch {}
  }
  return null;
}

function coerceGradient(input: StoredAura | null) {
  // Defaults
  let colors = DEFAULT_COLORS.slice();
  let locations = DEFAULT_LOCATIONS.slice();
  let opacity = DEFAULT_OPACITY;

  if (!input) {
    return { colors, locations, opacity };
  }

  // Plain string hex → two-stop gradient using same hue
  if (typeof input === 'string') {
    const c = input;
    colors = [withAlpha(c, opacity * 0.9), withAlpha(c, opacity * 0.6)];
    return { colors, locations, opacity };
  }

  // Object forms
  const obj = input as NonNullable<Exclude<StoredAura, string>>;
  if (typeof obj.opacity === 'number') {
    opacity = Math.max(0, Math.min(1, obj.opacity));
  }

  if (Array.isArray(obj.colors) && obj.colors.length >= 2) {
    colors = obj.colors.map((c, i) =>
      withAlpha(c, i === 0 ? opacity : Math.max(0, opacity * 0.7))
    );
    if (Array.isArray(obj.locations) && obj.locations.length === colors.length) {
      locations = obj.locations.slice();
    } else {
      locations = DEFAULT_LOCATIONS.slice();
    }
    return { colors, locations, opacity };
  }

  if (obj.start || obj.end) {
    const start = obj.start || '#120E1B';
    const end = obj.end || '#0E0A14';
    colors = [withAlpha(start, opacity), withAlpha(end, Math.max(0, opacity * 0.7))];
    locations = DEFAULT_LOCATIONS.slice();
    return { colors, locations, opacity };
  }

  // Fallback to defaults
  return { colors, locations, opacity };
}

export default function AuraOverlay({ strength = 1 }: AuraOverlayProps) {
  const [payload, setPayload] = useState<StoredAura | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const v = await loadStoredAura();
      if (mounted) setPayload(v);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const { colors, locations } = useMemo(() => coerceGradient(payload), [payload]);
  const scaledColors = useMemo(() => colors.map(c => scaleAlpha(c, strength)), [colors, strength]);

  return (
    <>
      <LinearGradient
        pointerEvents="none"
        colors={scaledColors}
        locations={locations}
        style={StyleSheet.absoluteFill}
      />
    </>
  );
}