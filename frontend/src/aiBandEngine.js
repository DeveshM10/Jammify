import { analyzeProgression, chooseStyleFromAnalysis } from "./musicTheory.js";

const rootMap = {
  C: ["C", "E", "G", "A", "B"],
  D: ["D", "F#", "A", "C", "E"],
  E: ["E", "G#", "B", "C#", "D"],
  F: ["F", "A", "C", "D", "E"],
  G: ["G", "B", "D", "E", "F"],
  A: ["A", "C#", "E", "G", "B"],
  B: ["B", "D#", "F#", "G#", "A"],
  "C#": ["C#", "E#", "G#", "A#", "B#"],
  "D#": ["D#", "F#", "A#", "C", "D"],
  "F#": ["F#", "A#", "C#", "D#", "E#"],
  "G#": ["G#", "B#", "D#", "E#", "F#"],
  "A#": ["A#", "C#", "E#", "G#", "B#"],
};

function parseChordRoot(chordName = "") {
  const cleaned = String(chordName || "").trim();
  if (!cleaned) return "C";
  const match = cleaned.match(/^([A-G](?:#|b)?)/i);
  if (!match) return "C";
  return match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
}

function normalizeRoot(root) {
  const normalized = String(root || "C").trim();
  if (!normalized) return "C";
  const direct = normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase();
  const fixed = direct === "Bb" ? "B" : direct === "Db" ? "D" : direct === "Eb" ? "E" : direct === "Gb" ? "G" : direct === "Ab" ? "A" : direct;
  return fixed;
}

function getBassVariation(index) {
  const cycle = [0, 0, 1, 0, 0, 2, 0, 1];
  return cycle[index % cycle.length];
}

function getLeadMelodyNote(root, index) {
  const normalized = normalizeRoot(root);
  const notes = rootMap[normalized] || rootMap.C;
  return notes[index % notes.length];
}

function getSongSections(chords = []) {
  if (!Array.isArray(chords) || chords.length === 0) {
    return [{ name: "Verse", start: 0, end: 0 }];
  }

  if (chords.length <= 5) {
    return [{ name: "Verse", start: 0, end: chords.length - 1 }];
  }

  if (chords.length <= 8) {
    return [
      { name: "Verse", start: 0, end: Math.floor(chords.length / 2) - 1 },
      { name: "Chorus", start: Math.floor(chords.length / 2), end: chords.length - 1 },
    ];
  }

  const verseEnd = Math.floor(chords.length * 0.4);
  const chorusEnd = Math.floor(chords.length * 0.7);

  return [
    { name: "Verse", start: 0, end: verseEnd - 1 },
    { name: "Chorus", start: verseEnd, end: chorusEnd - 1 },
    { name: "Bridge", start: chorusEnd, end: chords.length - 1 },
  ];
}

function getSectionForIndex(index, sections = []) {
  if (!sections.length) return { name: "Verse" };

  const match = sections.find((section) => index >= section.start && index <= section.end);
  return match || sections[0];
}

function getChordMood(chordName = "C", chordAnalysis = null) {
  // Use Roman numeral context from theory engine if available
  if (chordAnalysis) {
    const { romanNumeral, quality } = chordAnalysis;
    if (quality === "diminished") return "tense";
    if (romanNumeral === "V" || romanNumeral === "VII") return "bright";
    if (romanNumeral === "I" || romanNumeral === "IV") return "warm";
    if (romanNumeral === "vi" || romanNumeral === "ii") return "dreamy";
    if (romanNumeral === "chromatic") return "tense";
  }
  // Fallback: legacy string matching
  const cleaned = String(chordName).toUpperCase();
  if (cleaned.includes("7") || cleaned.includes("ADD") || cleaned.includes("9")) return "bright";
  if (cleaned.includes("M") || cleaned.includes("MAJ")) return "warm";
  if (cleaned.includes("MIN") || cleaned.includes("m")) return "dreamy";
  if (cleaned.includes("DIM") || cleaned.includes("°")) return "tense";
  return "neutral";
}

function getMoodPreset(style = "pop", chordName = "C") {
  const chordMood = getChordMood(chordName);
  const moodMap = {
    pop: { warm: "uplift", dreamy: "smooth", bright: "spark", tense: "drama", neutral: "steady" },
    rock: { warm: "anthem", dreamy: "grit", bright: "drive", tense: "edge", neutral: "steady" },
    cinematic: { warm: "epic", dreamy: "float", bright: "glow", tense: "shadow", neutral: "lift" },
    "lo-fi": { warm: "cozy", dreamy: "drift", bright: "sunset", tense: "night", neutral: "calm" },
    jazz: { warm: "swing", dreamy: "moody", bright: "bounce", tense: "late", neutral: "cool" },
    acoustic: { warm: "folk", dreamy: "gentle", bright: "open", tense: "raw", neutral: "rooted" },
  };

  const styleMap = moodMap[style] || moodMap.pop;
  return styleMap[chordMood] || styleMap.neutral || "steady";
}

const STYLE_PRESETS = {
  pop: {
    label: "Pop",
    instruments: {
      bass: "finger_bass",
      piano: "acoustic_grand_piano",
      rhythm: "church_organ",
      lead: "flute",
      pad: "violin",
      vocal: "flute",
    },
    volumes: { bass: 0.72, piano: 0.82, rhythm: 0.68, lead: 0.58, pad: 0.52, vocal: 0.74 },
    colors: { bass: "#00B894", piano: "#6D4AFF", rhythm: "#FDCB6E", lead: "#FF6B8A", pad: "#0984E3", vocal: "#FF4D9D" },
  },
  rock: {
    label: "Rock",
    instruments: {
      bass: "synth_bass",
      piano: "electric_grand_piano",
      rhythm: "rock_guitar",
      lead: "trumpet",
      pad: "string_ensemble",
      vocal: "trumpet",
    },
    volumes: { bass: 0.8, piano: 0.78, rhythm: 0.7, lead: 0.62, pad: 0.56, vocal: 0.78 },
    colors: { bass: "#2D9CDB", piano: "#9B51E0", rhythm: "#F2994A", lead: "#EB5757", pad: "#56CCF2", vocal: "#FF7F50" },
  },
  cinematic: {
    label: "Cinematic",
    instruments: {
      bass: "finger_bass",
      piano: "church_organ",
      rhythm: "string_ensemble",
      lead: "violin",
      pad: "flute",
      vocal: "violin",
    },
    volumes: { bass: 0.7, piano: 0.74, rhythm: 0.6, lead: 0.54, pad: 0.5, vocal: 0.7 },
    colors: { bass: "#6FCF97", piano: "#A78BFA", rhythm: "#BB6BD9", lead: "#F2C94C", pad: "#56CCF2", vocal: "#F72585" },
  },
  "lo-fi": {
    label: "Lo-fi",
    instruments: {
      bass: "synth_bass",
      piano: "electric_grand_piano",
      rhythm: "acoustic_grand_piano",
      lead: "flute",
      pad: "violin",
      vocal: "flute",
    },
    volumes: { bass: 0.68, piano: 0.7, rhythm: 0.6, lead: 0.45, pad: 0.42, vocal: 0.6 },
    colors: { bass: "#7F8C8D", piano: "#9B59B6", rhythm: "#D5A6BD", lead: "#E67E22", pad: "#5DADE2", vocal: "#FF9F1C" },
  },
  jazz: {
    label: "Jazz",
    instruments: {
      bass: "finger_bass",
      piano: "electric_grand_piano",
      rhythm: "church_organ",
      lead: "trumpet",
      pad: "string_ensemble",
      vocal: "trumpet",
    },
    volumes: { bass: 0.75, piano: 0.8, rhythm: 0.66, lead: 0.6, pad: 0.55, vocal: 0.72 },
    colors: { bass: "#34C759", piano: "#8E7CC3", rhythm: "#F1C40F", lead: "#E67E22", pad: "#5DADE2", vocal: "#FFB703" },
  },
  acoustic: {
    label: "Acoustic",
    instruments: {
      bass: "finger_bass",
      piano: "acoustic_grand_piano",
      rhythm: "rock_guitar",
      lead: "flute",
      pad: "violin",
      vocal: "flute",
    },
    volumes: { bass: 0.7, piano: 0.75, rhythm: 0.58, lead: 0.5, pad: 0.48, vocal: 0.66 },
    colors: { bass: "#27AE60", piano: "#8E44AD", rhythm: "#F9C74F", lead: "#FF7F50", pad: "#4ECDC4", vocal: "#F72585" },
  },
};

export const DEFAULT_AI_BAND_SELECTION = {
  bass: true,
  piano: true,
  rhythm: true,
  lead: true,
  pad: true,
  drums: true,
  vocal: true,
};

export const aiBandInstrumentOptions = [
  { key: "bass", label: "Bass" },
  { key: "piano", label: "Piano" },
  { key: "rhythm", label: "Rhythm" },
  { key: "lead", label: "Lead" },
  { key: "pad", label: "Pad" },
  { key: "drums", label: "Drums" },
  { key: "vocal", label: "Mic / Vocal" },
];

export const arrangementPresetOptions = [
  { value: "radio", label: "Radio" },
  { value: "live-band", label: "Live Band" },
  { value: "epic", label: "Epic" },
  { value: "lofi", label: "Lo-fi" },
  { value: "cinematic", label: "Cinematic" },
];

const ARRANGEMENT_PRESETS = {
  radio: {
    label: "Radio",
    densityBoost: 1.1,
    vocalBoost: 1.1,
    leadBoost: 1.1,
    drumAccent: "tight",
    hookBias: "bright",
  },
  "live-band": {
    label: "Live Band",
    densityBoost: 1.2,
    vocalBoost: 1.05,
    leadBoost: 1.15,
    drumAccent: "live",
    hookBias: "warm",
  },
  epic: {
    label: "Epic",
    densityBoost: 1.35,
    vocalBoost: 1.2,
    leadBoost: 1.35,
    drumAccent: "big",
    hookBias: "cinematic",
  },
  lofi: {
    label: "Lo-fi",
    densityBoost: 0.9,
    vocalBoost: 0.8,
    leadBoost: 0.95,
    drumAccent: "soft",
    hookBias: "dreamy",
  },
  cinematic: {
    label: "Cinematic",
    densityBoost: 1.25,
    vocalBoost: 1.15,
    leadBoost: 1.25,
    drumAccent: "wide",
    hookBias: "epic",
  },
};

function getArrangementPresetConfig(preset = "radio") {
  return ARRANGEMENT_PRESETS[preset] || ARRANGEMENT_PRESETS.radio;
}

function getDrumPattern(sectionName = "Verse", presetName = "radio") {
  const presetConfig = getArrangementPresetConfig(presetName);
  if (sectionName === "Chorus") {
    return presetConfig.drumAccent === "big" ? [true, false, true, false, true, true, false, true] : [true, true, false, true, true, false, true, false];
  }
  if (sectionName === "Bridge") {
    return [true, false, false, true, true, false, false, true];
  }
  if (presetConfig.drumAccent === "live") {
    return [true, false, true, false, true, false, true, false];
  }
  if (presetConfig.drumAccent === "wide") {
    return [true, false, false, true, false, true, false, false];
  }
  if (presetConfig.drumAccent === "soft") {
    return [true, false, false, false, true, false, false, true];
  }
  return [true, false, true, false, true, false, false, true];
}

function getArrangementFill(index, sections = [], preset = "radio") {
  if (sections.length === 0) return { isFill: false, intensity: 1, type: null };

  const section = sections.find((s) => index >= s.start && index <= s.end);
  if (!section) return { isFill: false, intensity: 1, type: null };

  const sectionIdx = sections.indexOf(section);
  const nextSection = sections[sectionIdx + 1] || null;
  const nextSectionStart = nextSection ? nextSection.start : null;

  // 3 chords before Chorus → drum-roll build-up window
  if (nextSection && nextSection.name === "Chorus" && nextSectionStart !== null) {
    if (index === nextSectionStart - 1) {
      const presetConfig = getArrangementPresetConfig(preset);
      return { isFill: true, intensity: presetConfig.densityBoost, type: "major-fill" };
    }
    if (index === nextSectionStart - 2) {
      return { isFill: true, intensity: 1.25, type: "drum-roll" };
    }
    if (index === nextSectionStart - 3) {
      return { isFill: true, intensity: 1.15, type: "build-up" };
    }
  }

  // Bridge entry → bass-drop on first chord of Bridge
  if (section.name === "Bridge" && index === section.start) {
    return { isFill: true, intensity: 1.3, type: "bass-drop" };
  }

  // Verse → Chorus: piano-run on the last chord of Verse (when next is Chorus)
  if (
    section.name === "Verse" &&
    nextSection?.name === "Chorus" &&
    nextSectionStart !== null &&
    index === nextSectionStart - 1
  ) {
    return { isFill: true, intensity: 1.2, type: "piano-run" };
  }

  // Generic last-chord-in-section fill
  if (nextSectionStart !== null && index === nextSectionStart - 1) {
    const presetConfig = getArrangementPresetConfig(preset);
    return { isFill: true, intensity: presetConfig.densityBoost, type: "major-fill" };
  }

  return { isFill: false, intensity: 1, type: null };
}

function chooseStyle(song) {
  // Legacy fallback — only used when no chordAnalyses are available
  const chords = Array.isArray(song?.chords) ? song.chords : [];
  const compact = chords.map((item) => String(item?.name || "")).join(" ").toUpperCase();

  if (compact.includes("7") || compact.includes("DOM")) return "rock";
  if (compact.includes("M") || compact.includes("MIN")) return "cinematic";
  if (compact.includes("9") || compact.includes("11")) return "jazz";
  if (compact.includes("ADD") || compact.includes("SUS")) return "acoustic";
  return "pop";
}

function makeTrack(name, instrument, volume, chords, color, preset = "default", style = "pop", sections = [], producerSettings = {}, arrangementPreset = "radio", chordAnalyses = []) {
  const trackId = Date.now() + Math.random() + Math.random();
  const energy = Math.min(100, Math.max(0, Number(producerSettings.energy ?? 75))) / 100;
  const vocalIntensity = Math.min(100, Math.max(0, Number(producerSettings.vocalIntensity ?? 70))) / 100;
  // Task 5: arrangementDensity now actually drives beat length + speed multipliers
  const arrangementDensity = Math.min(100, Math.max(0, Number(producerSettings.arrangementDensity ?? 70))) / 100;
  // density 0 → sparse (0.7×), density 1 → dense (1.3×)
  const densityMult = 0.7 + arrangementDensity * 0.6;

  const presetConfig = getArrangementPresetConfig(arrangementPreset);
  const sectionBoost = presetConfig.densityBoost || 1;

  return {
    id: trackId,
    name,
    instrument,
    volume,
    muted: false,
    solo: false,
    loop: true,
    color,
    arrangementPreset,
    sectionLabels: sections.map((section) => section.name),
    chords: chords.map((chord, index) => {
      const root = parseChordRoot(chord.name || "C");
      const bassVariation = getBassVariation(index);
      // Use theory-engine analysis if available, else fallback
      const chordAnalysis = chordAnalyses[index] || null;
      const resolvedMelodyNote = chordAnalysis?.resolvedMelodyNote || null;
      const resolvedOctave = chordAnalysis?.resolvedOctave || 5;
      const tensionScore = chordAnalysis?.tensionScore ?? null;
      const melodyNote = resolvedMelodyNote || getLeadMelodyNote(root, index);
      const section = getSectionForIndex(index, sections);
      const chordMood = getChordMood(chord.name || "C", chordAnalysis);
      const sectionBoostValue = section.name === "Chorus" ? (1.5 * sectionBoost) : section.name === "Bridge" ? (1.2 * sectionBoost) : (1 * sectionBoost);
      const chordDensity = style === "rock" ? 1 : style === "jazz" ? 2 : 1;
      const moodFlavor = getMoodPreset(style, chord.name || "C");
      const fillWindow = (index + 1) % 4 === 0 && section.name !== "Verse";

      // Task 5: apply density to base beat length
      const rawBeatLength = section.name === "Chorus"
        ? (style === "cinematic" ? 2 : 2)
        : (index % 4 === 0 && section.name === "Verse" ? (style === "cinematic" ? 2 : 1) : 1);
      const beatLength = Math.max(1, Math.round(rawBeatLength * densityMult));

      // Tension-driven speed boost (Requirement 9)
      const tensionSpeedBoost = tensionScore !== null ? (1 + 0.3 * tensionScore) : 1;

      const fill = getArrangementFill(index, sections, arrangementPreset);
      const base = {
        type: "chord",
        name: chord.name || "C",
        octave: 4,
        inversion: 0,
        beats: beatLength,
        repeat: 1,
        wait: 0,
        speed: 1,
        instrument,
        volume,
        pattern: [true],
        trackId,
        isFill: fill.isFill,
        fillType: fill.type,
      };

      // ── DRUMS ──────────────────────────────────────────────────────────────
      if (preset === "drums") {
        const drumBeats = section.name === "Chorus" ? 2 : 1;

        // Task 6: drum-roll fill — fast triplet-like pattern 3 chords before Chorus
        if (fill.type === "drum-roll") {
          return {
            ...base,
            type: "note",
            name: "C",
            octave: 3,
            beats: 1,
            speed: 0.95 + energy * 0.05,         // near-simultaneous hits
            pattern: [true, true, true, true, true, true, true, true],
            lyricHint: "drum-roll",
            shape: "drum-roll",
          };
        }

        const fillDrumSpeed = fill.isFill ? (1.2 + energy * 0.3) : (0.8 + energy * 0.45);
        return {
          ...base,
          type: "note",
          name: "C",
          octave: 3,
          beats: fillWindow ? 1 : (fill.isFill ? drumBeats * 1.2 : drumBeats),
          speed: fillDrumSpeed,
          pattern: getDrumPattern(section.name, arrangementPreset),
          lyricHint: "drums",
          shape: fill.isFill ? "kick-fill" : (section.name === "Chorus" ? (presetConfig.drumAccent === "big" ? "big" : "steady") : "steady"),
        };
      }

      // ── BASS ───────────────────────────────────────────────────────────────
      if (preset === "bass") {
        const bassSpeed = section.name === "Chorus" ? 0.9 : (bassVariation === 0 ? 0.25 : 0.55);

        // Task 6: bass-drop on Bridge entry — low octave, held note, silence before it
        if (fill.type === "bass-drop") {
          return {
            ...base,
            name: root,
            inversion: 0,
            octave: 2,
            beats: Math.max(1, Math.round(2 * densityMult)),
            speed: 0,                             // bass note only, full sustain
            wait: 0.05,                           // tiny breath gap for the drop effect
            pattern: [true],
            fillType: "bass-drop",
          };
        }

        const enhancedBassSpeed = bassSpeed * (fill.isFill ? 1.25 : 1);
        return {
          ...base,
          name: root,
          inversion: bassVariation,
          octave: style === "rock" ? 2 : 3,
          beats: Math.max(1, Math.round(
            (section.name === "Chorus" ? (style === "jazz" ? 2 : 1) : 1) * densityMult
          )),
          speed: enhancedBassSpeed,
          pattern: [true],
        };
      }

      // ── LEAD ───────────────────────────────────────────────────────────────
      if (preset === "lead") {
        const leadOctave = resolvedOctave || (section.name === "Chorus" ? 6 : (style === "cinematic" ? 6 : 5));
        const leadBeats = Math.max(1, Math.round(
          (section.name === "Chorus" ? 2 : (index % 3 === 0 ? 2 : 1)) * densityMult
        ));
        const leadSpeed = section.name === "Chorus"
          ? (1.0 + energy * 0.2)
          : (style === "rock" ? 0.95 : 0.8);
        const leadNote = resolvedMelodyNote || (chordMood === "dreamy" ? getLeadMelodyNote(root, index + 3) : melodyNote);
        const fillLeadNote = getLeadMelodyNote(root, index + 4);

        // piano-run fill
        if (fill.type === "piano-run") {
          return {
            ...base,
            type: "note",
            name: getLeadMelodyNote(root, index + 2),
            octave: leadOctave,
            beats: 1,
            speed: 0.65 + energy * 0.2,
            pattern: [true],
            fillHint: "piano-run",
            isFill: true,
          };
        }

        const intensifiedSpeed = Math.min(1, leadSpeed * fill.intensity * tensionSpeedBoost);
        return {
          ...base,
          type: "note",
          name: fill.isFill ? fillLeadNote : leadNote,
          octave: leadOctave + (fill.isFill ? 1 : 0),
          beats: fillWindow ? 1 : (fill.isFill ? Math.max(1, Math.round(leadBeats * 0.9)) : leadBeats),
          speed: fillWindow ? (1.15 + energy * 0.25) : intensifiedSpeed,
          pattern: [true],
          fillHint: fill.isFill ? fill.type : (fillWindow ? "bridge-fill" : moodFlavor),
          isFill: fill.isFill,
          romanNumeral: chordAnalysis?.romanNumeral,
        };
      }

      // ── PAD ────────────────────────────────────────────────────────────────
      if (preset === "pad") {
        const padOctave = style === "cinematic" ? 6 : 5;
        const padSpeed = chordDensity === 2 ? 0.4 : (section.name === "Chorus" ? 0.8 : 0.6);
        // Task 5: density drives pad speed — denser → fuller chord strums
        const densePadSpeed = Math.min(1, padSpeed * densityMult);
        const enhancedSpeed = densePadSpeed * (fill.isFill ? 1.15 : 1);
        return {
          ...base,
          name: chord.name || "C",
          octave: padOctave + (fill.isFill ? 1 : 0),
          beats: Math.max(1, Math.round(
            (section.name === "Chorus" ? 2 : (style === "lo-fi" ? 2 : 1)) * densityMult
          )),
          speed: enhancedSpeed,
          pattern: [true],
        };
      }

      // ── VOCAL ──────────────────────────────────────────────────────────────
      if (preset === "vocal") {
        // Task 4: phrase-aware call-and-response
        // Phrases are 2-chord units. Even phrase (0,1) = CALL, Odd phrase (2,3) = RESPONSE.
        // Response notes jump an octave higher and have a short breath-gap wait.
        const phraseIndex = Math.floor(index / 2);
        const isCallPhrase = phraseIndex % 2 === 0;
        const isResponsePhrase = !isCallPhrase;

        const callNote   = getLeadMelodyNote(root, index + 1);
        // Response answers the call with a note offset +3 up the scale
        const responseNote = getLeadMelodyNote(root, index + 4);
        // On major-fill (section boundary), use a different offset for drama
        const fillResponseNote = getLeadMelodyNote(root, index + 6);

        const isHook = section.name === "Chorus" || (index % 4 === 0 && section.name === "Verse");

        // Octave: responses go one octave higher than calls; Chorus pushes even higher
        const baseOctave   = section.name === "Chorus" ? 6 : (chordMood === "dreamy" ? 5 : 4);
        const vocalOctave  = isResponsePhrase ? baseOctave + 1 : baseOctave;
        // Fill responses jump another +1
        const fillOctave   = fill.isFill ? vocalOctave + 1 : vocalOctave;

        // Beats: calls sustain a bit longer; responses are tighter
        const vocalBeats = section.name === "Chorus"
          ? (isResponsePhrase ? 1 : 2)
          : isHook
            ? (isResponsePhrase ? 1 : Math.max(1, Math.round(1.5 * densityMult)))
            : Math.max(1, Math.round(1 * densityMult));

        // Speed: responses are slightly faster/tighter for a "echo" quality
        const vocalSpeed = section.name === "Chorus"
          ? (isResponsePhrase ? (1.3 + vocalIntensity * 0.3) : (1.1 + vocalIntensity * 0.2))
          : isHook
            ? (isResponsePhrase ? (1.15 + vocalIntensity * 0.2) : (1.0 + vocalIntensity * 0.15))
            : (isResponsePhrase ? 0.9 : 0.75);

        const intensifiedSpeed = vocalSpeed * fill.intensity;

        // Task 4: breath gap — responses get a short wait so the call resolves first
        const breathWait = isResponsePhrase ? 0.05 : 0;

        // Fill overrides
        const fillNote = fill.type === "major-fill" ? fillResponseNote : callNote;

        return {
          ...base,
          type: "note",
          name: fill.isFill ? fillNote : (isResponsePhrase ? responseNote : callNote),
          octave: Math.min(8, fillOctave),
          beats: fillWindow ? 1 : (fill.isFill ? Math.max(1, Math.round(vocalBeats * 0.8)) : vocalBeats),
          speed: fillWindow ? (1.15 + vocalIntensity * 0.3) : intensifiedSpeed,
          wait: fill.isFill ? 0 : breathWait,
          pattern: [true],
          lyricHint: fill.isFill ? "response" : (section.name === "Chorus" ? "hook" : (isResponsePhrase ? "response" : "call")),
          sectionName: section.name,
          shape: fill.isFill ? "response" : (isResponsePhrase ? "response" : moodFlavor),
          callResponse: isResponsePhrase || fill.type === "major-fill",
          phraseType: isCallPhrase ? "call" : "response",
        };
      }

      // ── DEFAULT (piano / rhythm) ───────────────────────────────────────────
      return {
        ...base,
        name: chord.name || "C",
        octave: section.name === "Chorus" ? (style === "rock" ? 4 : 5) : (style === "rock" ? 3 : 4),
        beats: Math.max(1, Math.round(
          beatLength * sectionBoostValue +
          (index % 3 === 0 && style === "jazz" ? 1 : 0)
        )),
        // Task 5: density drives rhythm speed
        speed: section.name === "Chorus"
          ? Math.min(1, 1.1 * densityMult)
          : (index % 2 === 0 ? Math.min(1, 0.7 * densityMult) : Math.min(1, 1 * densityMult)),
      };
    }),
  };
}

function normalizeSongSelection(selection = {}) {
  const base = { ...DEFAULT_AI_BAND_SELECTION };

  Object.keys(base).forEach((key) => {
    if (typeof selection[key] === "boolean") {
      base[key] = selection[key];
    }
  });

  return base;
}

export function buildBandFromSong(song, style = "pop", selection = DEFAULT_AI_BAND_SELECTION, producerSettings = {}, arrangementPreset = "radio") {
  const safeSong = song && Array.isArray(song.chords) && song.chords.length > 0 ? song : {
    title: "Demo Jam",
    chords: [
      { name: "C" }, { name: "G" }, { name: "Am" }, { name: "F" },
      { name: "C" }, { name: "G" }, { name: "Am" }, { name: "F" },
    ],
  };

  const songChords = safeSong.chords.map((chord, index) => ({
    ...chord,
    name: chord.name || "C",
    beats: index % 4 === 0 ? 2 : 1,
  }));

  // ── Music Theory Engine ──────────────────────────────────────────────────
  const chordNames = songChords.map((c) => c.name);
  const { tonic, mode, confidence, analyses: chordAnalyses } = analyzeProgression(chordNames);

  // Choose style from theory engine (tension-based) unless caller passed explicit style
  const resolvedStyle = STYLE_PRESETS[style]
    ? style
    : chooseStyleFromAnalysis(chordAnalyses) || chooseStyle(safeSong);
  const preset = STYLE_PRESETS[resolvedStyle] || STYLE_PRESETS.pop;
  const enabled = normalizeSongSelection(selection);
  const presetName = arrangementPreset || "radio";
  // ────────────────────────────────────────────────────────────────────────

  const leadPattern = songChords.map((chord, index) => ({
    ...chord,
    name: parseChordRoot(chord.name),
    beats: index % 4 === 0 ? 2 : 1,
    speed: index % 2 === 0 ? 0.4 : 0.75,
  }));

  const sections = getSongSections(songChords);
  const tracks = [];

  if (enabled.bass) {
    tracks.push(makeTrack(
      `${safeSong.title ? safeSong.title.split(" ")[0] : "Bass"} Bass`,
      preset.instruments.bass, preset.volumes.bass, songChords, preset.colors.bass,
      "bass", resolvedStyle, sections, producerSettings, presetName, chordAnalyses
    ));
  }
  if (enabled.piano) {
    tracks.push(makeTrack(
      "Piano",
      preset.instruments.piano, preset.volumes.piano, songChords, preset.colors.piano,
      "default", resolvedStyle, sections, producerSettings, presetName, chordAnalyses
    ));
  }
  if (enabled.rhythm) {
    tracks.push(makeTrack(
      "Rhythm",
      preset.instruments.rhythm, preset.volumes.rhythm, leadPattern, preset.colors.rhythm,
      "default", resolvedStyle, sections, producerSettings, presetName, chordAnalyses
    ));
  }
  if (enabled.drums) {
    tracks.push(makeTrack(
      "Drums / Percussion",
      preset.instruments.rhythm, preset.volumes.rhythm * 1.15, leadPattern, "#E17055",
      "drums", resolvedStyle, sections, producerSettings, presetName, chordAnalyses
    ));
  }
  if (enabled.lead) {
    tracks.push(makeTrack(
      "Lead",
      preset.instruments.lead, preset.volumes.lead, leadPattern, preset.colors.lead,
      "lead", resolvedStyle, sections, producerSettings, presetName, chordAnalyses
    ));
  }
  if (enabled.pad) {
    tracks.push(makeTrack(
      "Pad",
      preset.instruments.pad, preset.volumes.pad, leadPattern, preset.colors.pad,
      "pad", resolvedStyle, sections, producerSettings, presetName, chordAnalyses
    ));
  }
  if (enabled.vocal) {
    tracks.push(makeTrack(
      "Mic / Vocal",
      preset.instruments.vocal, preset.volumes.vocal, leadPattern, preset.colors.vocal,
      "vocal", resolvedStyle, sections, producerSettings, presetName, chordAnalyses
    ));
  }

  return tracks.length > 0 ? tracks : [
    makeTrack("Demo Bass", preset.instruments.bass, preset.volumes.bass, songChords, preset.colors.bass, "bass", resolvedStyle, sections, producerSettings, presetName, chordAnalyses),
    makeTrack("Demo Piano", preset.instruments.piano, preset.volumes.piano, songChords, preset.colors.piano, "default", resolvedStyle, sections, producerSettings, presetName, chordAnalyses),
  ];
}

export function buildDemoBand(style = "pop", selection = DEFAULT_AI_BAND_SELECTION, producerSettings = {}, arrangementPreset = "radio") {
  return buildBandFromSong({
    title: "Demo Jam",
    chords: [
      { name: "C" },
      { name: "G" },
      { name: "Am" },
      { name: "F" },
      { name: "C" },
      { name: "E7" },
      { name: "Am" },
      { name: "F" },
    ],
  }, style, selection, producerSettings, arrangementPreset);
}

export const styleOptions = Object.entries(STYLE_PRESETS).map(([value, config]) => ({ value, label: config.label }));
