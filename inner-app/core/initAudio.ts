import { Audio } from 'expo-av';
import TrackPlayer, { Capability, IOSCategory, IOSCategoryOptions } from 'react-native-track-player';

let didInit = false;

export async function initAudioOnce() {
  if (didInit) return;
  didInit = true;

  // TrackPlayer first — on iOS its setupPlayer configures AVAudioSession.
  // expo-av's setAudioModeAsync must run AFTER so it wins over TrackPlayer's session settings.
  try {
    try {
      await TrackPlayer.setupPlayer({
        waitForBuffer: true,
        iosCategory: IOSCategory.Playback,
        iosCategoryOptions: [
          IOSCategoryOptions.AllowBluetooth,
          IOSCategoryOptions.AllowBluetoothA2DP,
        ],
      });
    } catch (e: any) {
      if (!String(e).toLowerCase().includes('already')) throw e;
    }
    await TrackPlayer.updateOptions({
      stopWithApp: false,
      capabilities: [Capability.Play, Capability.Pause, Capability.SeekTo],
      progressUpdateEventInterval: 1,
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