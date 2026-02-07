// src/core/threading/computeThreadSuggestion.ts
import {
  ThreadSignature,
  ThreadSuggestion,
  ThreadMood,
} from "./threadTypes";

// Map ritual mood → next chamber/lesson/etc.
const ritualThreadMap: Record<
  ThreadMood,
  ThreadSuggestion | null
> = {
  grounded: {
    targetType: "chamber",
    targetId: "chamber1",
    label: "Enter Outer Sanctum",
  },
  activated: {
    targetType: "chamber",
    targetId: "chamber2",
    label: "Ignite Inner Flame",
  },
  expanded: {
    targetType: "chamber",
    targetId: "chamber3",
    label: "Walk the Horizon Gate",
  },
  reflective: {
    targetType: "chamber",
    targetId: "chamber4", // PR-style chamber or reflective path
    label: "Enter Resonance Field",
  },
};

// Map specific chamber → next step
const chamberThreadMap: Record<string, ThreadSuggestion | null> = {
  chamber1: {
    targetType: "lesson",
    targetId: "lesson_grounding_1",
    label: "Learn to hold your center",
  },
  chamber2: {
    targetType: "lesson",
    targetId: "lesson_flame_1",
    label: "Understand your inner momentum",
  },
  chamber3: {
    targetType: "soundscape",
    targetId: "soundscape_freeflow_1",
    label: "Float in free flow",
  },
  chamber4: {
    targetType: "lesson",
    targetId: "lesson_resonance_1",
    label: "Reflect in the Resonance Field",
  },
  chamber5: {
    targetType: "ritual",
    targetId: "cleanSlate",
    label: "Seal what surfaced",
  },
};

// Map lesson tiers → next steps
const lessonTierThreadMap: Record<string, ThreadSuggestion | null> = {
  intro: {
    targetType: "ritual",
    targetId: "pointZero",
    label: "Anchor the lesson in your body",
  },
  core: {
    targetType: "chamber",
    targetId: "chamber2",
    label: "Deepen with Inner Flame",
  },
  advanced: {
    targetType: "chamber",
    targetId: "chamber3",
    label: "Walk the Horizon Gate",
  },
  mastery: {
    targetType: "soundscape",
    targetId: "soundscape_mastery_1",
    label: "Rest in a quiet expanse",
  },
};

// Default for soundscapes: close with a ritual
const soundscapeDefault: ThreadSuggestion = {
  targetType: "ritual",
  targetId: "cleanSlate",
  label: "Close your journey with a reset",
};

export function computeThreadSuggestion(
  sig: ThreadSignature
): ThreadSuggestion | null {
  switch (sig.type) {
    case "ritual": {
      return ritualThreadMap[sig.mood] ?? null;
    }
    case "chamber": {
      return chamberThreadMap[sig.id] ?? null;
    }
    case "lesson": {
      if (!sig.tier) return null;
      return lessonTierThreadMap[sig.tier] ?? null;
    }
    case "soundscape": {
      return soundscapeDefault;
    }
    default:
      return null;
  }
}