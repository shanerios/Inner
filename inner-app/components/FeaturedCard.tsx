// components/FeaturedCard.tsx
import React from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';

export default function FeaturedCard({
  title, subtitle, onPress, progress=0,
}: { title:string; subtitle:string; onPress:()=>void; progress?:number }) {
  return (
    <Pressable onPress={onPress} style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.sub}>{subtitle}</Text>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.round(progress*100)}%` }]} />
      </View>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  card:{width:260,padding:16,borderRadius:16,backgroundColor:'rgba(10,8,20,0.35)',borderWidth:1,borderColor:'rgba(237,232,250,0.08)',marginRight:14},
  title:{color:'#EDE8FA',fontSize:16,fontWeight:'700'},
  sub:{color:'#B9B0EB',marginTop:4,fontSize:12},
  progressTrack:{height:3,backgroundColor:'rgba(237,232,250,0.12)',borderRadius:2,marginTop:12},
  progressFill:{height:3,backgroundColor:'#6E63D9',borderRadius:2},
});