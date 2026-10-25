import { Platform } from 'react-native';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Typography, tracking } from '../typography';

describe('tracking', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps the designed letter spacing on iOS', () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    expect(tracking(0.2)).toBe(0.2);
    expect(tracking(0.3)).toBe(0.3);
  });

  it('removes small letter spacing on Android, where it clips shrink-to-fit text', () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    expect(tracking(0.2)).toBe(0);
    expect(tracking(0.3)).toBe(0);
  });

  it('leaves the shared text styles with their designed spacing off Android', () => {
    // Evaluated at import under the test platform (iOS).
    expect(Typography.body.letterSpacing).toBe(0.2);
    expect(Typography.caption.letterSpacing).toBe(0.3);
  });
});
