const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push("png", "jpg", "jpeg", "svg");

module.exports = config;

