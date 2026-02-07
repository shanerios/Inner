// src/core/threading/ThreadEngine.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ThreadSignature,
  ThreadSuggestion,
  ThreadMood,
} from "./threadTypes";

const STORAGE_KEY = "@inner:lastThread";
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h

export async function saveThreadSignature(sig: ThreadSignature) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(sig));
  } catch (e) {
    // silent fail is fine for v1
    console.warn("[ThreadEngine] Failed to save signature", e);
  }
}

export async function getLastThread(): Promise<ThreadSignature | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const sig = JSON.parse(raw) as ThreadSignature;
    // Time-decay: ignore if older than 24h
    if (Date.now() - sig.timestamp > MAX_AGE_MS) {
      return null;
    }

    return sig;
  } catch (e) {
    console.warn("[ThreadEngine] Failed to load signature", e);
    return null;
  }
}

export async function clearThreadSignature() {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn("[ThreadEngine] Failed to clear signature", e);
  }
}