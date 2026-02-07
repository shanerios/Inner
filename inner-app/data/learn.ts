export const LEARN_TRACKS = {
  lucid: {
    id: 'lucid',
    title: 'Lucid Dreaming',
    lessons: [
      {
        id: 'lucid-prep',
        title: 'Lucid Dream Prep & Induction',
        level: 'intro',
        intentions: ['calm','clarity','grounding','reawakening'],
        durationMin: 4,
        mdPath: require('../learn/content/lucid/02_lucid_prep_induction.md')
      },
      {
        id: 'priming',
        title: 'Priming the Mind',
        level: 'intro',
        intentions: ['clarity','reawakening'],
        durationMin: 5,
        mdPath: require('../learn/content/lucid/01_priming_the_mind.md')
      },
      {
        id: 'dream-recall-coding',
        title: 'Dream Recall & Dream Coding',
        level: 'core',
        intentions: ['clarity','expansion'],
        prerequisites: ['priming'],
        durationMin: 20,
        mdPath: require('../learn/content/lucid/03_dream_recall_coding.md')
      },
      {
        id: 'reality-checks',
        title: 'Reality Checks and Daily Habits',
        level: 'core',
        intentions: ['clarity','grounding'],
        prerequisites: ['priming'],
        durationMin: 15,
        mdPath: require('../learn/content/lucid/04_reality_checks.md')
      },
      {
        id: 'stabilization',
        title: 'Stability and Extension Inside the Dream',
        level: 'core',
        intentions: ['calm','grounding'],
        prerequisites: ['reality-checks','dream-recall-coding'],
        durationMin: 15,
        mdPath: require('../learn/content/lucid/05_stability.md')
      },
      {
        id: 'dream-council',
        title: 'Advanced: The Dream Council & Contacting Guides in Lucid Space',
        level: 'advanced',
        intentions: ['expansion','clarity'],
        prerequisites: ['stabilization'],
        durationMin: 20,
        mdPath: require('../learn/content/lucid/06_dream_council.md')
      },
      {
        id: 'mirror-technique',
        title: 'Advanced: The Mirror Technique and Shadow Integration in Lucid Dreams',
        level: 'advanced',
        intentions: ['healing','clarity'],
        prerequisites: ['dream-recall-coding','stabilization'],
        durationMin: 20,
        mdPath: require('../learn/content/lucid/07_mirror.md')
      },
      {
        id: 'time-expansion',
        title: 'Advanced: Time Expansion and Dream Duration Mastery',
        level: 'advanced',
        intentions: ['expansion','calm'],
        prerequisites: ['stabilization'],
        durationMin: 20,
        mdPath: require('../learn/content/lucid/08_time_expansion.md')
      },
      {
        id: 'healing',
        title: 'Advanced: Lucid Healing and Restoring Body & Psyche',
        level: 'advanced',
        intentions: ['healing','calm'],
        prerequisites: ['stabilization'],
        durationMin: 20,
        mdPath: require('../learn/content/lucid/09_healing.md')
      },
      {
        id: 'death-rite',
        title: 'Mastery: The Lucid Death Rite and Conscious Transitioning',
        level: 'mastery',
        intentions: ['reawakening','expansion','healing'],
        prerequisites: ['time-expansion','healing'],
        durationMin: 20,
        mdPath: require('../learn/content/lucid/10_death_rite.md')
      },
      {
        id: 'lucid-creation',
        title: 'Mastery: Lucid Creation and Dream World Weaving',
        level: 'mastery',
        intentions: ['expansion','clarity'],
        prerequisites: ['stabilization'],
        durationMin: 20,
        mdPath: require('../learn/content/lucid/11_lucid_creation.md')
      },
      {
        id: 'collective-dreaming',
        title: 'Mastery: Collective Dreaming and Shared Dreamscapes',
        level: 'mastery',
        intentions: ['expansion','reawakening'],
        prerequisites: ['lucid-creation'],
        durationMin: 20,
        mdPath: require('../learn/content/lucid/12_collective_dreaming.md')
      },
      {
        id: 'temples',
        title: 'Mastery: Archetypcal Temples and Dream Libraries',
        level: 'mastery',
        intentions: ['clarity','expansion'],
        prerequisites: ['lucid-creation'],
        durationMin: 20,
        mdPath: require('../learn/content/lucid/13_temples.md')
      },
      {
        id: 'multiverse',
        title: 'Mastery: Dream Portals and the Multiverse',
        level: 'mastery',
        intentions: ['expansion'],
        prerequisites: ['time-expansion'],
        durationMin: 20,
        mdPath: require('../learn/content/lucid/14_multiverse.md')
      },
      {
        id: 'alchemy',
        title: 'Mastery: Lucid Alchemy and Transmutation of States',
        level: 'mastery',
        intentions: ['healing','expansion'],
        prerequisites: ['healing','lucid-creation'],
        durationMin: 20,
        mdPath: require('../learn/content/lucid/15_alchemy.md')
      }
    ]
  },
  obe: {
    id: 'obe',
    title: 'Out-of-Body Practice',
    lessons: [
      {
        id: 'intro',
        title: 'What is OBE?',
        level: 'intro',
        intentions: ['clarity'],
        durationMin: 5,
        mdPath: require('../learn/content/obe/01_obe_introduction.md')
      },
      {
        id: 'energy-body',
        title: 'Energy Body Awareness',
        level: 'core',
        intentions: ['grounding','clarity'],
        prerequisites: ['intro'],
        durationMin: 15,
        mdPath: require('../learn/content/obe/02_energy_body_awareness.md')
      },
      {
        id: 'sanctum-sphere',
        title: 'Sanctum Sphere: Protecting Your Energy Body',
        level: 'core',
        intentions: ['grounding','healing'],
        prerequisites: ['energy-body'],
        durationMin: 15,
        mdPath: require('../learn/content/obe/03_sanctum_sphere.md')
      },
      {
        id: 'sanctum-exploration',
        title: 'Exploring from the Sanctum',
        level: 'core',
        intentions: ['expansion','clarity'],
        prerequisites: ['sanctum-sphere'],
        durationMin: 20,
        mdPath: require('../learn/content/obe/04_sanctum_exploration.md')
      },
      {
        id: 'sanctum-programming',
        title: 'Programming the Sanctum Sphere',
        level: 'advanced',
        intentions: ['clarity','expansion'],
        prerequisites: ['sanctum-sphere'],
        durationMin: 20,
        mdPath: require('../learn/content/obe/05_sanctum_programming.md')
      },
      {
        id: 'sanctum-portal',
        title: 'Opening the Sanctum Sphere as a Portal',
        level: 'advanced',
        intentions: ['expansion'],
        prerequisites: ['sanctum-programming'],
        durationMin: 20,
        mdPath: require('../learn/content/obe/06_sanctum_portal.md')
      },
      {
        id: 'hypnagogic-navigation',
        title: 'Hypnagogic Navigation: Riding the Threshold',
        level: 'core',
        intentions: ['calm','clarity'],
        prerequisites: ['intro'],
        durationMin: 20,
        mdPath: require('../learn/content/obe/07_hypnagogic_navigation.md')
      },
      {
        id: 'exit-mastery',
        title: 'Exit Mastery: Separation Techniques',
        level: 'core',
        intentions: ['clarity','expansion'],
        prerequisites: ['hypnagogic-navigation'],
        durationMin: 20,
        mdPath: require('../learn/content/obe/08_exit_mastery.md')
      },
      {
        id: 'energetic-locomotion',
        title: 'Advanced: Energetic Locomotion and Moving in the Non-Physical',
        level: 'advanced',
        intentions: ['expansion'],
        prerequisites: ['exit-mastery'],
        durationMin: 20,
        mdPath: require('../learn/content/obe/09_energetic_locomotion.md')
      },
      {
        id: 'perception-tuning',
        title: 'Advanced: Perception Tuning and Nonphysical Sense Amplification',
        level: 'advanced',
        intentions: ['clarity','expansion'],
        prerequisites: ['exit-mastery'],
        durationMin: 20,
        mdPath: require('../learn/content/obe/10_perception_tuning.md')
      },
      {
        id: 'boundary-protocols',
        title: 'Advanced: Boundary Protocols and Entity Etiquette',
        level: 'advanced',
        intentions: ['grounding','clarity'],
        prerequisites: ['exit-mastery'],
        durationMin: 20,
        mdPath: require('../learn/content/obe/11_boundary_protocols.md')
      },
      {
        id: 'entity-councils',
        title: 'Advanced: Entity Councils and Collective Encounters',
        level: 'advanced',
        intentions: ['expansion','clarity'],
        prerequisites: ['boundary-protocols'],
        durationMin: 20,
        mdPath: require('../learn/content/obe/12_entity_councils.md')
      },
      {
        id: 'nonphysical-healing',
        title: 'Advanced: Healing in the Non-Physical',
        level: 'advanced',
        intentions: ['healing','calm'],
        prerequisites: ['exit-mastery'],
        durationMin: 20,
        mdPath: require('../learn/content/obe/13_nonphysical_healing.md')
      },
      {
        id: 'karmic-release',
        title: 'Advanced: Karmic Release and Soul Unbinding',
        level: 'advanced',
        intentions: ['healing','reawakening'],
        prerequisites: ['nonphysical-healing'],
        durationMin: 20,
        mdPath: require('../learn/content/obe/14_karmic_release.md')
      },
      {
        id: 'soul-surgery',
        title: 'Advanced: Soul Surgery and Deep Repair',
        level: 'advanced',
        intentions: ['healing'],
        prerequisites: ['nonphysical-healing'],
        durationMin: 20,
        mdPath: require('../learn/content/obe/15_soul_surgery.md')
      },
      {
        id: 'nonphysical-mapping',
        title: 'Mastery: Mapping the Non-Physical',
        level: 'mastery',
        intentions: ['clarity','expansion'],
        prerequisites: ['perception-tuning','energetic-locomotion'],
        durationMin: 20,
        mdPath: require('../learn/content/obe/16_nonphysical_mapping.md')
      },
      {
        id: 'astral-sanctuary',
        title: 'Mastery: Building Your Astral Sanctuary',
        level: 'mastery',
        intentions: ['grounding','healing','clarity'],
        prerequisites: ['nonphysical-mapping'],
        durationMin: 20,
        mdPath: require('../learn/content/obe/17_astral_sanctuary.md')
      },
      {
        id: 'psychopomp',
        title: 'Mastery: Psychopomp Partnership',
        level: 'mastery',
        intentions: ['healing','reawakening'],
        prerequisites: ['astral-sanctuary'],
        durationMin: 20,
        mdPath: require('../learn/content/obe/18_psychopomp.md')
      },
      {
        id: 'retrieval',
        title: 'Mastery: Retrieval Missions in the Non-Physical',
        level: 'mastery',
        intentions: ['healing','grounding'],
        prerequisites: ['psychopomp'],
        durationMin: 20,
        mdPath: require('../learn/content/obe/19_retrieval.md')
      },
      {
        id: 'akashic-hall',
        title: 'Mastery: The Akashic Hall and Accessing Records',
        level: 'mastery',
        intentions: ['clarity','expansion'],
        prerequisites: ['nonphysical-mapping'],
        durationMin: 20,
        mdPath: require('../learn/content/obe/20_akashic_hall.md')
      }
    ]
  }
};
// === Auto-metadata enrichment for Suggestion Engine ===
// Adds: focus, category, vibe, tags, frequencyHz, nextLevelId for each lesson
(function enrich() {
  const categoryFromIntent = (ints: string[] = []) => {
    const set = new Set(ints.map((s) => String(s).toLowerCase()));
    if (set.has('healing')) return 'healing';
    if (set.has('grounding')) return 'energy';
    if (set.has('clarity')) return 'mind';
    if (set.has('reawakening')) return 'expansion';
    if (set.has('calm')) return 'mind';
    return 'expansion';
  };
  const vibeFromLevel = (level?: string) => {
    const lv = String(level || 'core').toLowerCase();
    if (lv === 'intro' || lv === 'beginner') return 'calm';
    if (lv === 'core') return 'activating';
    return 'deep'; // advanced / mastery
  };

  (['lucid', 'obe', 'guide'] as const).forEach((trackKey) => {
    const track = (LEARN_TRACKS as any)[trackKey];
    if (!track?.lessons) return;
    for (let i = 0; i < track.lessons.length; i++) {
      const L = track.lessons[i] as any;
      if (!L) continue;
      // focus by track
      if (L.focus == null) L.focus = trackKey;
      // tags default to intentions
      if (L.tags == null && Array.isArray(L.intentions)) L.tags = [...L.intentions];
      // category from intentions
      if (L.category == null) L.category = categoryFromIntent(L.intentions || []);
      // vibe from level
      if (L.vibe == null) L.vibe = vibeFromLevel(L.level);
      // frequencyHz: gentle thematic defaults per track (can be overridden per lesson later)
      if (L.frequencyHz == null) {
        L.frequencyHz = trackKey === 'lucid' ? 528 : trackKey === 'obe' ? 432 : 396;
      }
      // nextLevelId → next lesson in same track when available
      if (L.nextLevelId == null) {
        const next = track.lessons[i + 1];
        if (next?.id) L.nextLevelId = next.id;
      }
    }
  });
})();
// Back-compat aliases and default export so other modules can consume consistently
export const learn_tracks = LEARN_TRACKS;
export default LEARN_TRACKS;