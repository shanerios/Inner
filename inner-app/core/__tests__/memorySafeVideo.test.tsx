import React from 'react';
import { AppState, Image } from 'react-native';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

let mockFocused = true;

jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => mockFocused,
  useRoute: () => ({ name: 'Test' }),
}));
jest.mock('@sentry/react-native', () => ({
  addBreadcrumb: jest.fn(), captureException: jest.fn(), setTag: jest.fn(), setContext: jest.fn(),
}));
jest.mock('expo-device', () => ({ isDevice: true, totalMemory: 12 * 1024 ** 3, deviceYearClass: 2023 }));
jest.mock('expo-video', () => {
  const React = require('react');
  return {
    VideoView: (props: object) => React.createElement('MockVideo', props),
    useVideoPlayer: () => React.useRef({ play: jest.fn(), pause: jest.fn(), replaceAsync: jest.fn(async () => undefined) }).current,
  };
});

import { STILL_HOLD_MS, VideoView, useVideoPlayer } from '../memorySafeVideo';

// A background that has a matching still image, and one that does not.
const WITH_STILL = require('../../assets/videos/arrive_bg.mp4');
const WITHOUT_STILL = { uri: 'https://example.com/background.mp4' };

function Probe({ source, enabled = true }: { source: unknown; enabled?: boolean }) {
  const player = useVideoPlayer(source as never, undefined, { enabled });
  return <VideoView player={player} contentFit="cover" style={{ flex: 1 }} nativeControls={false} />;
}

function render(source: unknown, enabled = true) {
  let renderer!: ReactTestRenderer;
  act(() => { renderer = TestRenderer.create(<Probe source={source} enabled={enabled} />); });
  const update = () => act(() => { renderer.update(<Probe source={source} enabled={enabled} />); });
  return {
    renderer,
    update,
    videos: () => renderer.root.findAllByType('MockVideo' as never),
    stills: () => renderer.root.findAllByType(Image),
  };
}

describe('background video wrapper', () => {
  beforeEach(() => {
    mockFocused = true;
    // The wrapper only plays video while the app is active.
    Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
    jest.useFakeTimers();
  });
  afterEach(() => { jest.useRealTimers(); });

  it('shows the still straight away under the playing video, so a screen never arrives without a picture', () => {
    const view = render(WITH_STILL);
    expect(view.videos()).toHaveLength(1);
    expect(view.stills()).toHaveLength(1);
    // The still comes first in the frame, so the video covers it once it has a first frame.
    const order: string[] = [];
    const walk = (node: unknown) => {
      if (!node || typeof node === 'string') return;
      const element = node as { type: string; children?: unknown[] | null };
      order.push(element.type);
      (element.children ?? []).forEach(walk);
    };
    walk(view.renderer.toJSON());
    const stillAt = order.findIndex(type => /image/i.test(type));
    const videoAt = order.indexOf('MockVideo');
    expect(stillAt).toBeGreaterThanOrEqual(0);
    expect(videoAt).toBeGreaterThan(stillAt);
  });

  it('keeps its picture while it leaves, instead of going dark at the start of the transition', () => {
    const view = render(WITH_STILL);
    mockFocused = false;
    view.update();
    expect(view.videos()).toHaveLength(0);
    expect(view.stills()).toHaveLength(1);
  });

  it('keeps the very same image view when the screen loses focus, so no empty frame appears while it decodes', () => {
    const view = render(WITH_STILL);
    const before = view.stills()[0];
    mockFocused = false;
    view.update();
    expect(view.videos()).toHaveLength(0);
    // The test renderer returns the same object for the same mounted component, and a new one for a rebuilt one.
    expect(view.stills()[0]).toBe(before);
    act(() => { jest.advanceTimersByTime(STILL_HOLD_MS + 10); });
    expect(view.stills()).toHaveLength(0);
    mockFocused = true;
    view.update();
    expect(view.stills()[0]).not.toBe(before);
  });

  it('lets the still go once the transition is over, so a screen in the back stack holds no picture', () => {
    const view = render(WITH_STILL);
    mockFocused = false;
    view.update();
    act(() => { jest.advanceTimersByTime(STILL_HOLD_MS - 1); });
    expect(view.stills()).toHaveLength(1);
    act(() => { jest.advanceTimersByTime(2); });
    expect(view.stills()).toHaveLength(0);
    expect(view.videos()).toHaveLength(0);
  });

  it('shows the picture again, and the video, when the screen comes back', () => {
    const view = render(WITH_STILL);
    mockFocused = false;
    view.update();
    act(() => { jest.advanceTimersByTime(STILL_HOLD_MS + 10); });
    expect(view.stills()).toHaveLength(0);
    mockFocused = true;
    view.update();
    expect(view.videos()).toHaveLength(1);
    expect(view.stills()).toHaveLength(1);
    // A second departure holds the still again for a full transition.
    mockFocused = false;
    view.update();
    expect(view.stills()).toHaveLength(1);
  });

  it('does not hold a picture it was never going to show, and drops its timer if the screen unmounts', () => {
    const view = render(WITH_STILL);
    mockFocused = false;
    view.update();
    act(() => { view.renderer.unmount(); });
    expect(() => act(() => { jest.advanceTimersByTime(STILL_HOLD_MS * 2); })).not.toThrow();
  });

  it('leaves a background that has no still exactly as it was: video when focused, empty when not', () => {
    const view = render(WITHOUT_STILL);
    expect(view.videos()).toHaveLength(1);
    expect(view.stills()).toHaveLength(0);
    mockFocused = false;
    view.update();
    expect(view.videos()).toHaveLength(0);
    expect(view.stills()).toHaveLength(0);
  });

  it('renders nothing but an empty frame for a page that is not enabled', () => {
    const view = render(WITH_STILL, false);
    expect(view.videos()).toHaveLength(0);
    expect(view.stills()).toHaveLength(0);
  });

  it('passes the caller\'s frame to the outer view, so layout is unchanged', () => {
    const view = render(WITH_STILL);
    const frame = view.stills()[0].parent!.parent!;
    const flat = ([] as unknown[]).concat(frame.props.style).flat(3);
    expect(flat).toEqual(expect.arrayContaining([expect.objectContaining({ flex: 1 })]));
  });
});
