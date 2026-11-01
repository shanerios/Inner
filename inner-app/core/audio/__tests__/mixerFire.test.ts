import { describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { MIXER_FIRE_VARIETY, mixerVarietyChange } from '../mixerFire';

describe('Fire in the mixers plays at the fullest setting of its own sounds, and nothing else does', () => {
  it('raises the variety when Fire is chosen, and remembers what it was', () => {
    expect(mixerVarietyChange('none', 'fire', 0, null)).toEqual({ identityVariety: MIXER_FIRE_VARIETY, remembered: 0 });
    expect(mixerVarietyChange('temple', 'fire', 0.6, null)).toEqual({ identityVariety: MIXER_FIRE_VARIETY, remembered: 0.6 });
    expect(MIXER_FIRE_VARIETY).toBe(1);
  });

  it('gives the variety back when another world, or Off, is chosen after Fire', () => {
    expect(mixerVarietyChange('fire', 'temple', 1, 0)).toEqual({ identityVariety: 0, remembered: null });
    expect(mixerVarietyChange('fire', 'none', 1, 0.6)).toEqual({ identityVariety: 0.6, remembered: null });
    // Nothing was remembered (for example, the mixer opened on Fire): fall back to the plain setting.
    expect(mixerVarietyChange('fire', 'ocean', 1, null)).toEqual({ identityVariety: 0, remembered: null });
  });

  it('leaves the variety alone for every change that does not involve Fire', () => {
    for (const [from, to] of [['ocean', 'temple'], ['temple', 'cosmic'], ['none', 'forest'], ['cosmic', 'none'], ['fire', 'fire']] as const) {
      const change = mixerVarietyChange(from, to, 0.6, 0.3);
      expect(change.identityVariety).toBeUndefined();
      expect(change.remembered).toBe(0.3);
    }
  });

  it('is applied by the environment pill and by nothing else, and does not touch the preview or membership code', () => {
    const root = path.resolve(__dirname, '../../..');
    const panel = fs.readFileSync(path.join(root, 'components/ProceduralMixerPanel.tsx'), 'utf8');
    expect(panel).toContain('mixerVarietyChange(draft.environment, option.value, draft.identityVariety, varietyBeforeFireRef.current)');
    const preview = fs.readFileSync(path.join(root, 'core/audio/premiumPreview.ts'), 'utf8');
    expect(preview).not.toContain('identityVariety');
  });
});
