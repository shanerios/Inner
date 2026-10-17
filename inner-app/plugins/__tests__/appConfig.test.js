const app = require('../../app.json').expo;

// App Store Connect rejects a build (ITMS-90683) when the code references a privacy-sensitive API
// without a matching purpose string. Some of our dependencies (expo-file-system's legacy asset
// handler, expo-video) reference the photo-library API even though Inner never reads photos.
describe('iOS purpose strings', () => {
  const plist = app.ios.infoPlist;

  it('explains the photo library string, and does not claim a feature the app lacks', () => {
    expect(typeof plist.NSPhotoLibraryUsageDescription).toBe('string');
    expect(plist.NSPhotoLibraryUsageDescription.length).toBeGreaterThan(40);
    expect(plist.NSPhotoLibraryUsageDescription).toMatch(/does not read or collect your photos/i);
  });

  it('keeps the microphone and speech strings on the speech recognition plugin', () => {
    const entry = app.plugins.find(p => Array.isArray(p) && p[0] === 'expo-speech-recognition');
    expect(entry[1].microphonePermission).toMatch(/microphone/i);
    expect(entry[1].speechRecognitionPermission).toMatch(/spoken dream/i);
  });
});
