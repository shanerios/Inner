import React, { useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet, AppState } from 'react-native';
import fog from '../assets/fx/fog.webp';

const FogPulse = () => {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        opacity.setValue(0);
        translateY.setValue(10);
        Animated.parallel([
          Animated.sequence([
            Animated.timing(opacity, {
              toValue: 0.08,
              duration: 1500,
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 0,
              duration: 1500,
              useNativeDriver: true,
            }),
          ]),
          Animated.timing(translateY, {
            toValue: 0,
            duration: 3000,
            useNativeDriver: true,
          }),
        ]).start();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [opacity, translateY]);

  return (
    <Animated.Image
      source={fog}
      style={[
        StyleSheet.absoluteFillObject,
        {
          opacity,
          transform: [{ translateY }],
          zIndex: -1,
        },
      ]}
      resizeMode="cover"
    />
  );
};

export default FogPulse;
