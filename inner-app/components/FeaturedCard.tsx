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
      <Text style={[Typography.title, { color: '#EDE8FA' }]}>{title}</Text>
      <Text style={[Body.regular, { color: '#B9B0EB', marginTop: 4 }]}>{subtitle}</Text>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.round(progress*100)}%` }]} />
      </View>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  card:{width:260,padding:16,borderRadius:16,backgroundColor:'rgba(10,8,20,0.35)',borderWidth:1,borderColor:'rgba(237,232,250,0.08)',marginRight:14},
  progressTrack:{height:3,backgroundColor:'rgba(237,232,250,0.12)',borderRadius:2,marginTop:12},
  progressFill:{height:3,backgroundColor:'#6E63D9',borderRadius:2},
});