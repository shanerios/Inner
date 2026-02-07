// components/Chip.tsx
import React from 'react';
import { Pressable, Text, StyleSheet, StyleProp, ViewStyle, TextStyle } from 'react-native';

export default function Chip({
  label, active, onPress, style, containerStyle, labelStyle,
}: { label: string; active?: boolean; onPress?: () => void; style?: ViewStyle; containerStyle?: StyleProp<ViewStyle>; labelStyle?: StyleProp<TextStyle> }) {
  return (
    <Pressable onPress={onPress} style={[styles.base, active && styles.active, style, containerStyle]}>
      <Text style={[styles.text, active && styles.textActive, labelStyle]}>{label}</Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  base:{paddingHorizontal:14,paddingVertical:8,borderRadius:20,backgroundColor:'rgba(237,232,250,0.08)',borderWidth:1,borderColor:'rgba(237,232,250,0.12)'},
  active:{backgroundColor:'rgba(185,176,235,0.2)',borderColor:'rgba(185,176,235,0.5)'},
  text:{color:'#DCD6F5',fontSize:13,letterSpacing:0.4},
  textActive:{color:'#EDE8FA',fontWeight:'600'},
});