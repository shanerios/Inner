// plugins/withTrackPlayerNotificationIcon.js
// Experimental: attempt to override the small icon used by react-native-track-player's
// media notification by providing a drawable named `ic_notification` at the app level.
//
// NOTE: RNTP does not expose a public config for the small icon in managed apps.
// This plugin copies your PNG into android/app/src/main/res/drawable/ so that if
// RNTP references `R.drawable.ic_notification` (unqualified), the app-level resource
// wins via resource merging. If RNTP references its own package (qualified), this
// will not take effect and we may need a patch-package. We'll test this path first.

const { withDangerousMod, withPlugins } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

function withCopySmallIcon(config, { icon }) {
  return withDangerousMod(config, ["android", async (cfg) => {
    const projectRoot = cfg.modRequest.projectRoot;
    const src = path.resolve(projectRoot, icon);
    const resDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res', 'drawable');
    const dst = path.join(resDir, 'ic_notification.png');

    if (!fs.existsSync(src)) {
      throw new Error(`Small icon not found at ${src}`);
    }
    fs.mkdirSync(resDir, { recursive: true });
    fs.copyFileSync(src, dst);
    console.log(`[withTrackPlayerNotificationIcon] Copied ${src} -> ${dst}`);

    return cfg;
  }]);
}

module.exports = function withTrackPlayerNotificationIcon(config, props = {}) {
  if (!props.icon) {
    console.warn('[withTrackPlayerNotificationIcon] No icon provided. Skipping.');
    return config;
  }
  return withPlugins(config, [
    [withCopySmallIcon, props],
  ]);
};
