import { Audio } from 'expo-av';
import TrackPlayer, { Capability } from 'react-native-track-player';

let didInit = false;

export async function initAudioOnce() {
  if (didInit) return;
  didInit = true;

  // TrackPlayer first — on iOS its setupPlayer configures AVAudioSession.
  // expo-av's setAudioModeAsync must run AFTER so it wins over TrackPlayer's session settings.
  try {
    try { await TrackPlayer.setupPlayer({ waitForBuffer: true }); } catch {}
    await TrackPlayer.updateOptions({
      stopWithApp: false,
      capabilities: [Capability.Play, Capability.Pause, Capability.SeekTo],
    });
  } catch {}

  try {
    await Audio.setIsEnabledAsync(true);
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: false,
    });
  } catch {}
}