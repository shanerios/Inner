// metro.config.js
const { getDefaultConfig } = require('@expo/metro-config');
const exclusionList = require('metro-config/src/defaults/exclusionList');

const config = getDefaultConfig(__dirname);

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
  blockList: exclusionList([
    /\/dist\/.*/,
    /\/\.claude\/.*/,
    /\/\.claude-worktrees\/.*/,
    /\/ios\/Pods\/.*/,
    /\/ios\/build\/.*/,
    /\/android\/.*/,
  ]),
};

module.exports = config;