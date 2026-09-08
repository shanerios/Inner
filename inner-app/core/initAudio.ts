import { Audio } from 'expo-av';
import TrackPlayer, { Capability, IOSCategory } from 'react-native-track-player';

let initPromise: Promise<void> | null = null;

export function initAudioOnce(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // TrackPlayer first — on iOS its setupPlayer configures AVAudioSession.
    // expo-av's setAudioModeAsync must run AFTER so it wins over TrackPlayer's session settings.
    try {
      try {
        await TrackPlayer.setupPlayer({
          waitForBuffer: true,
          autoHandleInterruptions: true,
          iosCategory: IOSCategory.Playback,
        });
        console.log('[AUDIO][INIT] TrackPlayer setup complete');
      } catch (e: any) {
        if (!String(e).toLowerCase().includes('already')) throw e;
        console.log('[AUDIO][INIT] TrackPlayer already initialized');
      }
      await TrackPlayer.updateOptions({
        capabilities: [Capability.Play, Capability.Pause, Capability.SeekTo, Capability.Stop],
        compactCapabilities: [Capability.Play, Capability.Pause],
        notificationCapabilities: [Capability.Play, Capability.Pause, Capability.SeekTo, Capability.Stop],
        progressUpdateEventInterval: 1,
        icon: require('../assets/images/inner_orb_icon.png'),
      });
      console.log('[AUDIO][INIT] system media controls enabled');
    } catch (error) {
      console.log('[AUDIO][INIT] TrackPlayer initialization failed', error);
    }

    try {
      await Audio.setIsEnabledAsync(true);
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: false,
      });
    } catch (error) {
      console.log('[AUDIO][INIT] Expo audio mode failed', error);
    }
  })();

  return initPromise;
}
