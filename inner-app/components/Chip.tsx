// components/Chip.tsx
import React from 'react';
import { Pressable, Text, StyleSheet, ViewStyle } from 'react-native';

export default function Chip({
  label, active, onPress, style,
}: { label: string; active?: boolean; onPress?: () => void; style?: ViewStyle }) {
  return (
    <Pressable onPress={onPress} style={[styles.base, active && styles.active, style]}>
      <Text style={[styles.text, active && styles.textActive]}>{label}</Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  base:{paddingHorizontal:14,paddingVertical:8,borderRadius:20,backgroundColor:'rgba(237,232,250,0.08)',borderWidth:1,borderColor:'rgba(237,232,250,0.12)'},
  active:{backgroundColor:'rgba(185,176,235,0.2)',borderColor:'rgba(185,176,235,0.5)'},
  text:{color:'#DCD6F5',fontSize:13,letterSpacing:0.4},
  textActive:{color:'#EDE8FA',fontWeight:'600'},
});