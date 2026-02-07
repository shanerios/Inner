// src/core/threading/threadTypes.ts
export type ThreadSourceType = "ritual" | "lesson" | "chamber" | "soundscape";

export type ThreadMood =
  | "grounded"
  | "activated"
  | "expanded"
  | "reflective";

export type ThreadTier = "intro" | "core" | "advanced" | "mastery";

export type ThreadSignature = {
  type: ThreadSourceType;
  id: string;              // e.g. "chamber1", "innerFlame", "lesson_intro_1"
  tier?: ThreadTier;       // mainly for lessons/chambers
  mood: ThreadMood;
  timestamp: number;       // Date.now()
};

export type ThreadTargetType = "ritual" | "lesson" | "chamber" | "soundscape";

export type ThreadSuggestion = {
  targetType: ThreadTargetType;
  targetId: string;        // id to look up in your data maps
  label?: string;          // optional human label (for CTA copy)
};