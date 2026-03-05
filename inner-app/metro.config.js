// metro.config.js
const path = require('path');
const { getDefaultConfig } = require('@expo/metro-config');
const exclusionList = require('metro-config/src/defaults/exclusionList');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

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

  blockList: exclusionList([
    /\/\.claude\/.*/,
    /\/\.claude-worktrees\/.*/,
    /\/node_modules_old\/.*/,
    /\/ios\/Pods\/.*/,
    /\/ios\/build\/.*/,
    /\/android\/.*/,
  ]),
};

module.exports = config;