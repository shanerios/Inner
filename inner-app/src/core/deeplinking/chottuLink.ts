// src/core/deeplinking/chottuLink.ts
//
// Deferred deep-link resolution for the Littlest Explorer QR campaign.
// getinner.app/explorer -> https://inner.chottu.link/explorer is the link
// printed in the books; ChottuLink fingerprint-matches the install to the
// pre-install click and emits a resolved/error event shortly after launch.
//
// First launch only: wait briefly for resolution. If it matches the
// Explorer campaign, skip the (adult-oriented) onboarding survey entirely
// and drop the user straight into the Garden's Explorer's Grove with the
// welcome modal. Any error, non-match, or timeout is a silent no-op —
// normal onboarding proceeds exactly as it already does.
import { NativeEventEmitter, NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeChottuLink } from 'react-native-chottulink-sdk';
import { navigationRef } from '../../navigation/navigationRef';

// Plain AsyncStorage (not the encrypted/Keychain-backed secureStorage) —
// this must reset on reinstall to correctly mean "per install", and Keychain
// data can survive an uninstall on iOS.
const FIRST_LAUNCH_HANDLED_KEY = 'chottu.explorerFirstLaunchHandled.v1';
const RESOLUTION_TIMEOUT_MS = 4000;

let didInit = false;

// TODO: confirm against the actual destinationURL/metadata configured for
// this campaign in the ChottuLink dashboard — this is a best-guess substring
// match since that config lives on their side, not in this repo.
function isExplorerLink(data: any): boolean {
  const url: string = data?.url ?? '';
  if (typeof url !== 'string') return false;
  return /\/explorer(\/|$|\?)/i.test(url) || url.includes('inner.chottu.link');
}

function routeToExplorersGrove() {
  if (!navigationRef.isReady()) return;
  // @ts-ignore
  navigationRef.reset({
    index: 0,
    routes: [{ name: 'Soundscapes', params: { category: 'explorers_grove', showExplorerWelcome: true } }],
  });
}

export function initChottuLinkOnce() {
  if (didInit) return;
  didInit = true;

  const apiKey = process.env.EXPO_PUBLIC_CHOTTULINK_API_KEY;
  if (!apiKey) return;

  try {
    initializeChottuLink(apiKey);
  } catch {
    return;
  }

  const { ChottuLinkEventEmitter } = NativeModules;
  if (!ChottuLinkEventEmitter) return;

  (async () => {
    try {
      const alreadyHandled = await AsyncStorage.getItem(FIRST_LAUNCH_HANDLED_KEY);
      if (alreadyHandled === 'true') return;

      const emitter = new NativeEventEmitter(ChottuLinkEventEmitter);
      let settled = false;
      let timeoutId: ReturnType<typeof setTimeout>;

      const finish = async (onExplorerMatch: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        resolvedSub.remove();
        errorSub.remove();
        await AsyncStorage.setItem(FIRST_LAUNCH_HANDLED_KEY, 'true');
        if (onExplorerMatch) routeToExplorersGrove();
        // otherwise: fall through, normal onboarding proceeds untouched
      };

      const resolvedSub = emitter.addListener('ChottuLinkDeepLinkResolved', (data: any) => {
        finish(isExplorerLink(data)).catch(() => {});
      });

      const errorSub = emitter.addListener('ChottuLinkDeepLinkError', () => {
        finish(false).catch(() => {});
      });

      timeoutId = setTimeout(() => { finish(false).catch(() => {}); }, RESOLUTION_TIMEOUT_MS);
    } catch {
      // fall back to normal onboarding
    }
  })();
}
