// components/FeaturedCard.tsx
import React from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import { Typography, Body as _Body } from '../core/typography';
const Body = _Body ?? ({
  regular: { fontFamily: 'Inter-ExtraLight', fontSize: 14 },
  subtle: { fontFamily: 'Inter-ExtraLight', fontSize: 12 },
} as const);

export default function FeaturedCard({
  title, subtitle, onPress, progress=0,
}: { title:string; subtitle:string; onPress:()=>void; progress?:number }) {
  return (
    <Pressable onPress={onPress} style={styles.card}>
      <Text style={[Typography.title, { color: '#F3EDE7' }]}>{title}</Text>
      <Text style={[Body.regular, { color: 'rgba(200,160,80,0.7)', marginTop: 4 }]}>{subtitle}</Text>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.round(progress*100)}%` }]} />
      </View>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  card:{width:260,padding:16,borderRadius:12,backgroundColor:'rgba(0,0,0,0.75)',borderWidth:1,borderColor:'rgba(255,255,255,0.08)',marginRight:14},
  progressTrack:{height:3,backgroundColor:'rgba(255,255,255,0.10)',borderRadius:2,marginTop:12},
  progressFill:{height:3,backgroundColor:'rgba(200,160,80,0.7)',borderRadius:2},
});