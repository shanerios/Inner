import * as Application from 'expo-application';

/** Standalone Inner Lab builds and dev builds only; never a production install. */
export const INNER_LAB_BUILD =
  __DEV__ ||
  process.env.EXPO_PUBLIC_INNER_LAB === '1' ||
  Application.applicationId === 'com.getinner.app.proceduraldev';
