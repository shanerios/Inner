module.exports = function (api) {
  const isProduction = api.env('production');
  return {
    presets: ['babel-preset-expo', '@babel/preset-flow'],
    plugins: [
      ...(isProduction ? ['./plugins/removeConsoleInProduction'] : []),
      'react-native-reanimated/plugin',
    ],
  };
};
