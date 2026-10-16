// metro.config.js
const path = require('path');

const {
  getSentryExpoConfig
} = require("@sentry/react-native/metro");

const projectRoot = __dirname;
const config = getSentryExpoConfig(projectRoot);

// Enable SVG support via react-native-svg-transformer
config.transformer = {
  ...config.transformer,
  babelTransformerPath: require.resolve('react-native-svg-transformer'),
};

// Add .md to assetExts and make sure .svg is handled by sourceExts
const { assetExts, sourceExts } = config.resolver;
config.resolver = {
  ...config.resolver,
  assetExts: [...assetExts.filter(ext => ext !== 'svg'), 'md'],
  sourceExts: [...sourceExts, 'svg'],

  // Prevent Metro from walking up and picking up node_modules from other folders/worktrees
  disableHierarchicalLookup: true,
  nodeModulesPaths: [path.resolve(projectRoot, 'node_modules')],

  // Metro accepts a plain list of patterns; the old exclusionList deep import is gone in Metro 0.83.
  blockList: [
    /\/\.claude\/.*/,
    /\/\.claude-worktrees\/.*/,
    /\/node_modules_old\/.*/,
    /\/ios\/Pods\/.*/,
    /\/ios\/build\/.*/,
    /\/android\/.*/,
  ],
};

module.exports = config;