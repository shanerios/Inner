import { createNavigationContainerRef } from '@react-navigation/native';

/**
 * Imperative navigation ref — allows non-React code (paywallController, etc.)
 * to navigate without needing to be inside a component tree.
 * Pass this ref to <NavigationContainer ref={navigationRef}>.
 */
export const navigationRef = createNavigationContainerRef();
