const base = require('./app.json').expo;

module.exports = () => {
  const isProceduralDevelopmentBuild = process.env.INNER_PROCEDURAL_DEV_BUILD === 'true';
  if (!isProceduralDevelopmentBuild) return base;

  return {
    ...base,
    name: 'Inner Lab',
    scheme: 'inner-procedural-dev',
    ios: {
      ...base.ios,
      bundleIdentifier: 'com.getinner.app.proceduraldev',
    },
    android: {
      ...base.android,
      package: 'com.getinner.app.proceduraldev',
    },
  };
};
