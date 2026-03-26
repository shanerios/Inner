// service.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import TrackPlayer, { Event } from 'react-native-track-player';

const SLEEP_TIMER_END_KEY = 'inner_sleep_timer_end_ms';
const SLEEP_TIMER_FADE_DURATION_MS = 6000;
const SLEEP_TIMER_FADE_STEPS = 12;
let sleepTimerFiring = false;

async function clearSleepTimerEnd() {
  try {
    await AsyncStorage.removeItem(SLEEP_TIMER_END_KEY);
  } catch {}
}

async function fadeOutAndPause() {
  const stepDelay = SLEEP_TIMER_FADE_DURATION_MS / SLEEP_TIMER_FADE_STEPS;

  try {
    for (let i = 1; i <= SLEEP_TIMER_FADE_STEPS; i += 1) {
      const v = 1 - i / SLEEP_TIMER_FADE_STEPS;
      await TrackPlayer.setVolume(v);
      await new Promise(resolve => setTimeout(resolve, stepDelay));
    }

    await TrackPlayer.pause();
  } finally {
    try {
      await TrackPlayer.setVolume(1);
    } catch {}
  }
}

async function maybeRunSleepTimer() {
  if (sleepTimerFiring) return;

  try {
    const raw = await AsyncStorage.getItem(SLEEP_TIMER_END_KEY);
    if (!raw) return;

    const endMs = Number(raw);
    if (!Number.isFinite(endMs) || endMs <= 0) {
      await clearSleepTimerEnd();
      return;
    }

    if (Date.now() < endMs) return;

    sleepTimerFiring = true;
    await clearSleepTimerEnd();
    await fadeOutAndPause();
  } catch {
    try {
      await TrackPlayer.pause();
      await TrackPlayer.setVolume(1);
      await clearSleepTimerEnd();
    } catch {}
  } finally {
    sleepTimerFiring = false;
  }
}

module.exports = async function () {
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.destroy());
  TrackPlayer.addEventListener(Event.RemoteSeek, ({ position }) => TrackPlayer.seekTo(position));
  TrackPlayer.addEventListener(Event.RemoteNext, () => TrackPlayer.skipToNext().catch(()=>{}));
  TrackPlayer.addEventListener(Event.RemotePrevious, () => TrackPlayer.skipToPrevious().catch(()=>{}));
  TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, async () => {
    await maybeRunSleepTimer();
  });

  TrackPlayer.addEventListener(Event.PlaybackState, async () => {
    await maybeRunSleepTimer();
  });
};